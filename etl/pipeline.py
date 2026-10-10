"""ETL pipeline (SPEC §6.1): check → fetch → stage → validate → swap/merge → record → recompute → notify.

Guarantees
* `--dry-run` stops after validate: live tables (ref.*/obs.*) and meta.data_sources are never touched;
  only staging.* and a meta.ingest_jobs row (status 'dry_run') are written.
* Validation failure → status 'blocked', live tables untouched.
* Swap = ONE transaction: live → archive.<table>_v<version>, staging → live, indexes/sequences renamed
  back to the original names, ACL copied, archive keeps the newest 2 versions. Readers never see an
  empty table (they block for the few ms of the ALTERs and then read the new table).
* Idempotent: unchanged source (token == meta.data_sources.last_checksum) → 'skipped'.

ingest_jobs.status vocabulary: running | success | skipped | dry_run | blocked | failed
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
from psycopg import sql

from lib import http, storage
from lib.config import RunContext
from lib.grid import cell_range
from sources.base import GRID_UPDATE, MERGE, REPLACE, STAGE_ONLY, Rows, Source, Target

log = logging.getLogger("etl.pipeline")

ARCHIVE_KEEP = 2


class ValidationFailed(Exception):
    def __init__(self, checks: list[dict]):
        self.checks = checks
        bad = [c for c in checks if not c["ok"]]
        super().__init__("; ".join(f"{c['target']}:{c['name']} {c.get('detail', '')}" for c in bad))


@dataclass
class JobResult:
    source: str
    status: str
    rows: int | None = None
    message: str = ""
    details: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {"source": self.source, "status": self.status, "rows": self.rows, "message": self.message}


def ident(*parts: str) -> sql.Identifier:
    return sql.Identifier(*parts)


# --------------------------------------------------------------------------------------------- tiers
def next_run_at(tier: str | None, now: datetime) -> datetime | None:
    """Next scheduled run per SPEC §6.1 cron (19:00 UTC = 02:00 ICT next day)."""
    def at(y: int, m: int, d: int = 1) -> datetime:
        return datetime(y, m, d, 19, 0, tzinfo=timezone.utc)

    if tier == "daily":
        t = now.replace(hour=19, minute=0, second=0, microsecond=0)
        return t if t > now else t + timedelta(days=1)
    months = {"quarterly": (1, 4, 7, 10), "semiannual": (1, 7)}.get(tier or "")
    if not months:
        return None
    for y in (now.year, now.year + 1):
        for m in months:
            if at(y, m) > now:
                return at(y, m)
    return None


# --------------------------------------------------------------------------------------------- pipeline
class Pipeline:
    def __init__(self, ctx: RunContext):
        self.ctx = ctx
        self.S = ctx.schemas

    # ---------------------------------------------------------------- db
    def connect(self) -> psycopg.Connection:
        conn = psycopg.connect(self.ctx.database_url, autocommit=True, application_name="petchwork-etl")
        conn.execute("set search_path = public, extensions")
        return conn

    def live(self, t: Target) -> sql.Identifier:
        return ident(self.S.resolve(t.schema), t.table)

    def stg(self, t: Target) -> sql.Identifier:
        return ident(self.S.staging, t.table)

    # ---------------------------------------------------------------- run
    def run(self, src: Source) -> JobResult:
        ctx = self.ctx
        self._t0 = time.monotonic()
        steps: dict = {"scope": ctx.scope, "version": ctx.version, "dry_run": ctx.dry_run}
        with self.connect() as conn:
            source_id, last_checksum, tier = self._source_meta(conn, src.code)
            job_id = self._job_start(conn, src.code)
            try:
                # 1. check
                chk = src.check(ctx)
                steps["check"] = {"token": chk.token, **chk.info}
                if chk.skip_reason:
                    return self._finish(conn, job_id, JobResult(src.code, "skipped", 0, chk.skip_reason), steps)
                token = f"{ctx.scope}|{chk.token}" if chk.token else None
                if token and not ctx.force and token == last_checksum:
                    return self._finish(conn, job_id, JobResult(src.code, "skipped", 0, "unchanged"), steps)

                # 2. fetch
                files = src.fetch(ctx)
                raw_sum = http.sha256_bytes(*sorted(http.sha256_file(f) for f in files if f.is_file()))
                steps["fetch"] = {"files": len(files), "sha256": raw_sum, "raw_dir": str(ctx.raw_dir(src.code))}
                storage_path = str(ctx.raw_dir(src.code))
                if ctx.upload_raw and not ctx.dry_run:
                    storage_path = storage.upload_dir(ctx.raw_dir(src.code), f"{src.code}/{ctx.run_date}") or storage_path

                # 3. stage
                produced = src.produce(ctx, files)
                is_seed, has_real = self._snapshot_state(conn, src.code)
                staged: dict[str, dict] = {}
                for t in src.targets:
                    rows = produced.get(t.table)
                    if rows is None:
                        raise RuntimeError(f"source produced no rows object for {t.table}")
                    staged[t.table] = self.stage(conn, src, t, rows, source_id, is_seed)
                steps["stage"] = staged

                # 4. validate
                checks: list[dict] = []
                for t in src.targets:
                    checks += self.validate(conn, t, staged[t.table], has_real)
                steps["validate"] = checks
                if not all(c["ok"] for c in checks):
                    raise ValidationFailed(checks)

                total = sum(s["staged_total"] for s in staged.values())
                if ctx.dry_run:
                    msg = ", ".join(f"{k}: {v['new_rows']} new / {v['staged_total']} staged" for k, v in staged.items())
                    return self._finish(conn, job_id, JobResult(src.code, "dry_run", total, msg), steps)

                # 5. swap / merge + 6. record  (one transaction)
                changed_area = None
                with conn.transaction():
                    conn.execute("set local lock_timeout = '15s'")
                    for t in src.targets:
                        if t.mode in (REPLACE, GRID_UPDATE):
                            area = self._changed_area(conn, t)
                            changed_area = self._union_area(conn, changed_area, area)
                            self.swap_table(conn, self.S.resolve(t.schema), t.table)
                        elif t.mode == MERGE:
                            steps.setdefault("merge", {})[t.table] = self.merge(conn, t)
                    for q, params in src.after_swap_sql(ctx):
                        conn.execute(q, params)
                    self._record(conn, src.code, token, raw_sum, total, changed_area, storage_path, tier)
                for t in src.targets:
                    if t.mode in (REPLACE, GRID_UPDATE):
                        conn.execute(sql.SQL("analyze {}").format(self.live(t)))

                # 7. recompute
                if changed_area and ctx.recompute:
                    steps["recompute"] = self.recompute(conn, changed_area, src.code)
                res = JobResult(src.code, "success", total, f"version {ctx.version}")
                return self._finish(conn, job_id, res, steps)
            except ValidationFailed as e:
                steps["error"] = str(e)
                return self._finish(conn, job_id, JobResult(src.code, "blocked", None, f"validation: {e}"), steps)
            except Exception as e:  # noqa: BLE001 — every failure is recorded, live data untouched
                log.exception("source %s failed", src.code)
                steps["error"] = f"{type(e).__name__}: {e}"
                return self._finish(conn, job_id, JobResult(src.code, "failed", None, steps["error"][:500]), steps)

    # ---------------------------------------------------------------- meta helpers
    def _source_meta(self, conn, code: str) -> tuple[int | None, str | None, str | None]:
        row = conn.execute(
            sql.SQL("select id, last_checksum, refresh_tier from {} where code = %s").format(
                ident(self.S.meta, "data_sources")),
            (code,),
        ).fetchone()
        if not row:
            raise RuntimeError(f"meta.data_sources has no code '{code}'")
        return row

    def _snapshot_state(self, conn, code: str) -> tuple[bool, bool]:
        """(latest snapshot is the synthetic seed, any non-seed snapshot exists)."""
        rows = conn.execute(
            sql.SQL("select version from {} where source_code = %s order by created_at desc, id desc").format(
                ident(self.S.meta, "data_snapshots")),
            (code,),
        ).fetchall()
        versions = [r[0] for r in rows]
        is_seed = bool(versions) and versions[0] == "seed"
        return is_seed, any(v != "seed" for v in versions)

    def _job_start(self, conn, code: str) -> int:
        return conn.execute(
            sql.SQL("insert into {} (source_code, started_at, status) values (%s, now(), 'running') returning id").format(
                ident(self.S.meta, "ingest_jobs")),
            (code,),
        ).fetchone()[0]

    def _finish(self, conn, job_id: int, res: JobResult, steps: dict) -> JobResult:
        steps["seconds"] = round(time.monotonic() - getattr(self, "_t0", time.monotonic()), 1)
        res.details = steps
        level = logging.INFO if res.status in ("success", "skipped", "dry_run") else logging.ERROR
        log.log(level, "[%s] %s %s", res.source, res.status, res.message)
        try:
            conn.execute(
                sql.SQL("update {} set finished_at = now(), status = %s, rows = %s, log = %s where id = %s").format(
                    ident(self.S.meta, "ingest_jobs")),
                (res.status, res.rows, json.dumps({"message": res.message, **steps}, default=str, ensure_ascii=False)[:200_000], job_id),
            )
        except Exception:  # noqa: BLE001
            log.exception("could not update ingest_jobs %s", job_id)
        return res

    def _record(self, conn, code, token, checksum, total, changed_area, storage_path, tier) -> None:
        conn.execute(
            sql.SQL(
                "insert into {} (source_code, version, checksum, row_count, bbox, changed_area, storage_path) "
                "values (%s, %s, %s, %s, ST_GeomFromText(%s, 4326), "
                "case when %s::text is null then null else ST_Multi(ST_GeomFromEWKT(%s::text)) end, %s)"
            ).format(ident(self.S.meta, "data_snapshots")),
            (code, self.ctx.version, checksum, total, self.ctx.bbox_wkt, changed_area, changed_area, storage_path),
        )
        conn.execute(
            sql.SQL(
                "update {} set last_checksum = %s, last_success_at = now(), next_run_at = %s where code = %s"
            ).format(ident(self.S.meta, "data_sources")),
            (token, next_run_at(tier, datetime.now(timezone.utc)), code),
        )

    # ---------------------------------------------------------------- stage
    def _columns(self, conn, schema: str, table: str) -> dict[str, str]:
        rows = conn.execute(
            "select a.attname, format_type(a.atttypid, a.atttypmod) from pg_attribute a "
            "where a.attrelid = (quote_ident(%s) || '.' || quote_ident(%s))::regclass "
            "and a.attnum > 0 and not a.attisdropped order by a.attnum",
            (schema, table),
        ).fetchall()
        return dict(rows)

    def _create_staging(self, conn, t: Target) -> None:
        stg, live = self.stg(t), self.live(t)
        conn.execute(sql.SQL("drop table if exists {} cascade").format(stg))
        if t.mode == STAGE_ONLY:
            conn.execute(sql.SQL(t.ddl.format(schema=self.S.staging)))  # type: ignore[union-attr]
            return
        conn.execute(sql.SQL("create table {} (like {} including all excluding defaults excluding identity)").format(stg, live))
        # serial id → own sequence in staging (moves with the table on swap)
        live_cols = self._columns(conn, self.S.resolve(t.schema), t.table)
        seq = conn.execute(
            "select pg_get_serial_sequence(%s, 'id')", (f"{self.S.resolve(t.schema)}.{t.table}",)
        ).fetchone() if "id" in live_cols else None
        if seq and seq[0]:
            sname = ident(self.S.staging, f"{t.table}_id_seq")
            conn.execute(sql.SQL("drop sequence if exists {}").format(sname))
            conn.execute(sql.SQL("create sequence {} owned by {}.id").format(sname, stg))
            conn.execute(sql.SQL("alter table {} alter column id set default nextval({})").format(
                stg, sql.Literal(f"{self.S.staging}.{t.table}_id_seq")))

    def _geom_expr(self, t: Target, srid: int) -> sql.Composable:
        g = sql.SQL("ST_SetSRID(ST_GeomFromWKB(l.geom_wkb), {})").format(sql.Literal(srid))
        if srid != 4326:
            g = sql.SQL("ST_Transform({}, 4326)").format(g)
        if t.geom_type in ("multipolygon", "polygon"):
            g = sql.SQL("ST_MakeValid({})").format(g)
            if t.simplify_tol:
                g = sql.SQL("ST_MakeValid(ST_SimplifyPreserveTopology({}, {}))").format(g, sql.Literal(t.simplify_tol))
            g = sql.SQL("ST_CollectionExtract({}, 3)").format(g)
            if t.geom_type == "multipolygon":
                g = sql.SQL("ST_Multi({})").format(g)
        return g

    def stage(self, conn, src: Source, t: Target, rows: Rows, source_id: int | None, is_seed: bool) -> dict:
        ctx = self.ctx
        t0 = time.monotonic()
        self._create_staging(conn, t)
        stg_cols = self._columns(conn, self.S.staging, t.table)
        attr_cols = [c for c in rows.columns if c != "geom"]
        for c in attr_cols:
            if c not in stg_cols:
                raise RuntimeError(f"{t.table}: unknown column {c}")
        load = ident(self.S.staging, f"_load_{t.table}")
        defs = [sql.SQL("{} {}").format(ident(c), sql.SQL(stg_cols[c])) for c in attr_cols]
        if rows.has_geom:
            defs.append(sql.SQL("geom_wkb bytea"))
        conn.execute(sql.SQL("drop table if exists {}").format(load))
        conn.execute(sql.SQL("create unlogged table {} ({})").format(load, sql.SQL(", ").join(defs)))
        copy_cols = [ident(c) for c in attr_cols] + ([ident("geom_wkb")] if rows.has_geom else [])
        n_loaded = 0
        with conn.cursor() as cur:
            with cur.copy(sql.SQL("copy {} ({}) from stdin").format(load, sql.SQL(", ").join(copy_cols))) as cp:
                for r in rows.rows:
                    cp.write_row(r)
                    n_loaded += 1

        stg = self.stg(t)
        live = self.live(t)
        cols_sql = sql.SQL(", ").join(ident(c) for c in attr_cols)
        lcols_sql = sql.SQL(", ").join(sql.SQL("l.{}").format(ident(c)) for c in attr_cols)
        extra_cols, extra_vals = [], []
        if "source_id" in stg_cols and "source_id" not in attr_cols and source_id is not None:
            extra_cols.append(ident("source_id"))
            extra_vals.append(sql.Literal(source_id))
        kept = 0
        params = {"bbox": ctx.bbox_wkt, "provinces": src.provinces(ctx)}

        if t.mode == REPLACE:
            keep = t.keep_where_on_seed if is_seed else t.keep_where
            if keep:
                keep_cols = [c for c in stg_cols if c != "id"]
                kc = sql.SQL(", ").join(ident(c) for c in keep_cols)
                kept = conn.execute(
                    sql.SQL("insert into {} ({}) select {} from {} where ").format(stg, kc, kc, live) + sql.SQL(keep),
                    params,
                ).rowcount
            ins_cols = [ident(c) for c in attr_cols] + extra_cols
            vals = [sql.SQL("l.{}").format(ident(c)) for c in attr_cols] + extra_vals
            conn.execute(
                sql.SQL(
                    "insert into {stg} ({cols}, geom) select {vals}, g from "
                    "(select l.*, {gexpr} as g from {load} l where l.geom_wkb is not null) l "
                    "where g is not null and not ST_IsEmpty(g)"
                ).format(stg=stg, cols=sql.SQL(", ").join(ins_cols), vals=sql.SQL(", ").join(vals),
                         gexpr=self._geom_expr(t, rows.srid), load=load)
            )
        elif t.mode == GRID_UPDATE:
            conn.execute(sql.SQL("insert into {} select * from {}").format(stg, live))
            self._ensure_grid_cells(conn, stg)
            if t.grid_columns:  # refreshed area: no value from the source → null (never keep stale/seed values)
                conn.execute(sql.SQL(
                    "update {stg} set {cols} where ST_Intersects(ST_Centroid(geom), ST_GeomFromText(%s, 4326))"
                ).format(stg=stg, cols=sql.SQL(", ").join(sql.SQL("{} = null").format(ident(c)) for c in t.grid_columns)),
                    (ctx.bbox_wkt,))
            sets = sql.SQL(", ").join(sql.SQL("{c} = l.{c}").format(c=ident(c)) for c in attr_cols if c != "id")
            conn.execute(
                sql.SQL("update {stg} g set {sets}, updated_at = now() from {load} l where g.id = l.id").format(
                    stg=stg, sets=sets, load=load)
            )
        elif t.mode in (MERGE, STAGE_ONLY):
            if rows.has_geom:
                conn.execute(
                    sql.SQL("insert into {} ({}, geom) select {}, {} from {} l").format(
                        stg, cols_sql, lcols_sql, self._geom_expr(t, rows.srid), load)
                )
            else:
                conn.execute(sql.SQL("insert into {} ({}) select {} from {} l").format(stg, cols_sql, lcols_sql, load))
        conn.execute(sql.SQL("drop table {}").format(load))
        conn.execute(sql.SQL("analyze {}").format(stg))
        total = conn.execute(sql.SQL("select count(*) from {}").format(stg)).fetchone()[0]
        new_rows = total - kept if t.mode != GRID_UPDATE else n_loaded
        info = {"loaded": n_loaded, "kept_from_live": kept, "new_rows": new_rows, "staged_total": total,
                "seconds": round(time.monotonic() - t0, 1)}
        log.info("  staged %s.%s: %s", self.S.staging, t.table, info)
        return info

    def _ensure_grid_cells(self, conn, stg: sql.Identifier) -> None:
        """Insert missing 0.01° cells inside bbox whose centre lies in a province (D-012 ids)."""
        ir, jr = cell_range(self.ctx.bbox)
        conn.execute(
            sql.SQL(
                "insert into {stg} (id, weather_grid_id, province_code, updated_at, geom) "
                "select i::bigint * 36000 + j, (i / 10) * 3600 + (j / 10), p.code, now(), "
                "  ST_MakeEnvelope(j / 100.0 - 180, i / 100.0 - 90, (j + 1) / 100.0 - 180, (i + 1) / 100.0 - 90, 4326) "
                "from generate_series(%s::int, %s::int) i cross join generate_series(%s::int, %s::int) j "
                "cross join lateral (select a.code from {adm} a where a.level = 'province' and ST_Intersects(a.geom, "
                "  ST_SetSRID(ST_MakePoint((j + 0.5) / 100.0 - 180, (i + 0.5) / 100.0 - 90), 4326)) "
                "  order by a.code limit 1) p "
                "on conflict (id) do nothing"
            ).format(stg=stg, adm=ident(self.S.ref, "admin_boundaries")),
            (ir.start, ir.stop - 1, jr.start, jr.stop - 1),
        )

    # ---------------------------------------------------------------- validate
    def validate(self, conn, t: Target, staged: dict, has_real: bool) -> list[dict]:
        stg, live = self.stg(t), self.live(t)
        out: list[dict] = []

        def add(name: str, ok: bool, detail="") -> None:
            out.append({"target": t.table, "name": name, "ok": bool(ok), "detail": detail})

        add("rows>0", staged["new_rows"] > 0, f"new={staged['new_rows']}")

        if t.mode in (REPLACE, GRID_UPDATE):
            if has_real:
                live_n = conn.execute(sql.SQL("select count(*) from {}").format(live)).fetchone()[0]
                n = staged["staged_total"]
                delta = abs(n - live_n) / live_n if live_n else (0.0 if n == 0 else 1.0)
                add("row_delta", delta <= t.max_row_delta or not live_n,
                    f"live={live_n} staged={n} delta={delta:.1%} max={t.max_row_delta:.0%}")
            else:
                add("row_delta", True, "first real load (previous = seed/none) — skipped")

        if t.has_geom and t.mode != STAGE_ONLY:
            bad = conn.execute(sql.SQL(
                "select count(*) from {} where geom is null or not ST_IsValid(geom) or ST_SRID(geom) <> 4326").format(stg)
            ).fetchone()[0]
            add("geom_valid_100pct", bad == 0, f"invalid={bad}")

        for c in t.required:
            n = conn.execute(sql.SQL("select count(*) from {} where {} is null").format(stg, ident(c))).fetchone()[0]
            add(f"not_null:{c}", n == 0, f"nulls={n}")

        for c, (lo, hi) in t.ranges.items():
            n = conn.execute(sql.SQL("select count(*) from {} where {c} < %s or {c} > %s").format(stg, c=ident(c)),
                             (lo, hi)).fetchone()[0]
            add(f"range:{c}[{lo},{hi}]", n == 0, f"out_of_range={n}")

        if t.mode == GRID_UPDATE and t.min_non_null:
            for c, frac in t.min_non_null.items():
                row = conn.execute(sql.SQL(
                    "select count(*), count({c}) from {stg} where ST_Intersects(ST_Centroid(geom), ST_GeomFromText(%s, 4326))"
                ).format(c=ident(c), stg=stg), (self.ctx.bbox_wkt,)).fetchone()
                got = row[1] / row[0] if row[0] else 0
                add(f"non_null_frac:{c}", got >= frac, f"{row[1]}/{row[0]} = {got:.1%} (min {frac:.0%})")

        if t.coverage_flag and t.has_geom:
            missing = conn.execute(sql.SQL(
                "select c.province_code from {cov} c join {adm} a on a.level = 'province' and a.code = c.province_code "
                "where c.{flag} and ST_Area(ST_Intersection(a.geom, ST_GeomFromText(%s, 4326))) > 0 "
                "and not exists (select 1 from {stg} s where s.geom && a.geom and ST_Intersects(s.geom, a.geom)) "
                "order by 1"
            ).format(cov=ident(self.S.ref, "province_coverage"), adm=ident(self.S.ref, "admin_boundaries"),
                     flag=ident(t.coverage_flag), stg=stg), (self.ctx.bbox_wkt,)).fetchall()
            add(f"coverage:{t.coverage_flag}", not missing, f"missing provinces={[m[0] for m in missing]}")
        return out

    # ---------------------------------------------------------------- swap / merge
    def _changed_area(self, conn, t: Target) -> str | None:
        """EWKT MultiPolygon of the area whose data changed (envelopes; conservative)."""
        stg, live = self.stg(t), self.live(t)
        if t.mode == GRID_UPDATE:
            cols = [c for c in t.grid_columns]
            cmp = sql.SQL(" or ").join(
                sql.SQL("n.{c} is distinct from o.{c}").format(c=ident(c)) for c in cols) if cols else sql.SQL("true")
            q = sql.SQL(
                "select ST_AsEWKT(ST_Multi(ST_UnaryUnion(ST_Collect(b)))) from ("
                " select ST_Envelope(ST_Collect(n.geom)) b from {stg} n left join {live} o using (id)"
                " where o.id is null or {cmp} group by n.weather_grid_id) s"
            ).format(stg=stg, live=live, cmp=cmp)
        else:
            cols = [c for c in self._columns(conn, self.S.staging, t.table) if c not in ("id", "geom")]
            rowexpr = sql.SQL("md5(row({})::text || coalesce(encode(ST_AsEWKB(geom), 'hex'), ''))").format(
                sql.SQL(", ").join(ident(c) for c in cols))
            q = sql.SQL(
                "with n as (select {h} h, geom from {stg}), o as (select {h} h, geom from {live}),"
                " d as (select geom from n where h not in (select h from o)"
                "       union all select geom from o where h not in (select h from n))"
                " select ST_AsEWKT(ST_Multi(ST_CollectionExtract(ST_UnaryUnion(ST_Collect(ST_Envelope(geom))), 3)))"
                " from d where geom is not null"
            ).format(h=rowexpr, stg=stg, live=live)
        row = conn.execute(q).fetchone()
        return row[0] if row and row[0] and "EMPTY" not in row[0] else None

    @staticmethod
    def _union_area(conn, a: str | None, b: str | None) -> str | None:
        if not a or not b:
            return a or b
        return conn.execute(
            "select ST_AsEWKT(ST_Multi(ST_CollectionExtract(ST_UnaryUnion(ST_Collect(ST_GeomFromEWKT(%s), ST_GeomFromEWKT(%s))), 3)))",
            (a, b),
        ).fetchone()[0]

    @staticmethod
    def _sfx_name(name: str, sfx: str) -> str:
        return f"{name[: 63 - len(sfx) - 1]}_{sfx}"

    @staticmethod
    def _norm_indexdef(d: str) -> str:
        return re.sub(r"INDEX \S+ ON (ONLY )?\S+", "INDEX ON", d)

    def swap_table(self, conn, live_schema: str, table: str, *, version: str | None = None) -> str:
        """Atomic swap (caller holds the transaction). Returns the archive table name."""
        A, Sg = self.S.archive, self.S.staging
        sfx = "v" + (version or self.ctx.version).lower()
        live_reg = f"{live_schema}.{table}"
        old_idx = conn.execute(
            "select indexname, indexdef from pg_indexes where schemaname = %s and tablename = %s", (live_schema, table)
        ).fetchall()
        old_seqs = [r[0] for r in conn.execute(
            "select s.relname from pg_depend d join pg_class s on s.oid = d.objid and s.relkind = 'S' "
            "where d.refobjid = %s::regclass and d.deptype = 'a'", (live_reg,)).fetchall()]
        acl = conn.execute(
            "select a.grantee::regrole::text, a.privilege_type from pg_class c, aclexplode(c.relacl) a "
            "where c.oid = %s::regclass and a.grantee <> c.relowner and a.grantee <> 0", (live_reg,)).fetchall()

        conn.execute(sql.SQL("lock table {} in access exclusive mode").format(ident(live_schema, table)))
        for name, _ in old_idx:
            conn.execute(sql.SQL("alter index {} rename to {}").format(
                ident(live_schema, name), ident(self._sfx_name(name, sfx))))
        for s in old_seqs:
            conn.execute(sql.SQL("alter sequence {} rename to {}").format(
                ident(live_schema, s), ident(self._sfx_name(s, sfx))))
        arch_name = self._sfx_name(table, sfx)
        conn.execute(sql.SQL("alter table {} rename to {}").format(ident(live_schema, table), ident(arch_name)))
        conn.execute(sql.SQL("alter table {} set schema {}").format(ident(live_schema, arch_name), ident(A)))

        new_idx = conn.execute(
            "select indexname, indexdef from pg_indexes where schemaname = %s and tablename = %s", (Sg, table)
        ).fetchall()
        new_seqs = [r[0] for r in conn.execute(
            "select s.relname from pg_depend d join pg_class s on s.oid = d.objid and s.relkind = 'S' "
            "where d.refobjid = %s::regclass and d.deptype = 'a'", (f"{Sg}.{table}",)).fetchall()]
        conn.execute(sql.SQL("alter table {} set schema {}").format(ident(Sg, table), ident(live_schema)))

        # restore original index / sequence names
        by_def = {self._norm_indexdef(d): n for n, d in new_idx}
        for name, d in old_idx:
            cur = by_def.pop(self._norm_indexdef(d), None)
            if cur and cur != name:
                conn.execute(sql.SQL("alter index {} rename to {}").format(ident(live_schema, cur), ident(name)))
        for s_new, s_old in zip(sorted(new_seqs), sorted(old_seqs), strict=False):
            if s_new != s_old:
                conn.execute(sql.SQL("alter sequence {} rename to {}").format(ident(live_schema, s_new), ident(s_old)))
        for grantee, priv in acl:
            conn.execute(sql.SQL("grant {} on {} to {}").format(sql.SQL(priv), ident(live_schema, table), ident(grantee)))

        # retention: newest ARCHIVE_KEEP versions
        arch = [r[0] for r in conn.execute(
            "select tablename from pg_tables where schemaname = %s and tablename ~ %s order by tablename desc",
            (A, f"^{re.escape(table[:63 - len(sfx) - 1])}_v[0-9]{{8}}t[0-9]{{6}}$"),
        ).fetchall()]
        for old in arch[ARCHIVE_KEEP:]:
            conn.execute(sql.SQL("drop table {} cascade").format(ident(A, old)))
        log.info("  swapped %s.%s (archive %s.%s, kept %d versions)", live_schema, table, A, arch_name,
                 min(len(arch), ARCHIVE_KEEP))
        return arch_name

    def rollback_table(self, conn, live_schema: str, table: str) -> str:
        """Swap the newest archive version back into live (live goes to archive). Caller holds tx."""
        A, Sg = self.S.archive, self.S.staging
        arch = conn.execute(
            "select tablename from pg_tables where schemaname = %s and tablename ~ %s order by tablename desc limit 1",
            (A, f"^{re.escape(table)}_v[0-9]{{8}}t[0-9]{{6}}$"),
        ).fetchone()
        if not arch:
            raise RuntimeError(f"no archive version for {live_schema}.{table}")
        arch = arch[0]
        sfx = arch[len(table) + 1:]
        # move archive → staging under the original names, then reuse swap_table
        idx = conn.execute("select indexname from pg_indexes where schemaname = %s and tablename = %s", (A, arch)).fetchall()
        seqs = [r[0] for r in conn.execute(
            "select s.relname from pg_depend d join pg_class s on s.oid = d.objid and s.relkind = 'S' "
            "where d.refobjid = %s::regclass and d.deptype = 'a'", (f"{A}.{arch}",)).fetchall()]
        conn.execute(sql.SQL("drop table if exists {} cascade").format(ident(Sg, table)))
        conn.execute(sql.SQL("alter table {} set schema {}").format(ident(A, arch), ident(Sg)))
        conn.execute(sql.SQL("alter table {} rename to {}").format(ident(Sg, arch), ident(table)))
        for (name,) in idx:
            if name.endswith("_" + sfx):
                conn.execute(sql.SQL("alter index {} rename to {}").format(ident(Sg, name), ident(name[: -len(sfx) - 1])))
        for s in seqs:
            if s.endswith("_" + sfx):
                conn.execute(sql.SQL("alter sequence {} rename to {}").format(ident(Sg, s), ident(s[: -len(sfx) - 1])))
        return self.swap_table(conn, live_schema, table,
                               version=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S"))

    def merge(self, conn, t: Target) -> int:
        stg, live = self.stg(t), self.live(t)
        cols = [c for c in self._columns(conn, self.S.staging, t.table)]
        upd = [c for c in cols if c not in t.key]
        q = sql.SQL("insert into {live} ({cols}) select {cols} from {stg} on conflict ({key}) do ").format(
            live=live, cols=sql.SQL(", ").join(ident(c) for c in cols), stg=stg,
            key=sql.SQL(", ").join(ident(c) for c in t.key))
        q += (sql.SQL("update set {}").format(sql.SQL(", ").join(
            sql.SQL("{c} = excluded.{c}").format(c=ident(c)) for c in upd)) if upd else sql.SQL("nothing"))
        n = conn.execute(q).rowcount
        log.info("  merged %d rows into %s", n, ".".join([self.S.resolve(t.schema), t.table]))
        return n

    # ---------------------------------------------------------------- recompute
    def recompute(self, conn, changed_area: str, source_code: str) -> dict:
        S = self.S
        out = {"fields": 0, "runs_marked_stale": 0, "profiles": 0, "via": None}
        try:
            with conn.transaction():
                ids = [r[0] for r in conn.execute(
                    sql.SQL("select id from {} where ST_Intersects(geom, ST_GeomFromEWKT(%s))").format(
                        ident(S.app, "fields")), (changed_area,)).fetchall()]
                out["fields"] = len(ids)
                if not ids:
                    return out
                out["runs_marked_stale"] = conn.execute(
                    sql.SQL("update {} set is_stale = true where field_id = any(%s) and not is_stale").format(
                        ident(S.sim, "model_runs")), (ids,)).rowcount
                has_queue = conn.execute(
                    "select exists (select 1 from pg_extension where extname = 'pgmq') "
                    "and exists (select 1 from pg_namespace where nspname = 'pgmq')"
                ).fetchone()[0] and conn.execute(
                    "select exists (select 1 from pgmq.list_queues() q where q.queue_name = 'profile_refresh')"
                ).fetchone()[0]
                if has_queue:
                    for fid in ids:
                        conn.execute("select pgmq.send('profile_refresh', %s::jsonb)",
                                     (json.dumps({"field_id": str(fid), "reason": f"etl:{source_code}"}),))
                    out["via"] = "pgmq:profile_refresh"
                else:
                    out["profiles"] = conn.execute(
                        sql.SQL(
                            "insert into {fp} (field_id, profile, data_versions, computed_at) "
                            "select f.id, p.v, p.v -> 'data_versions', now() from {f} f "
                            "cross join lateral (select public.analyze_polygon(ST_AsGeoJSON(f.geom)::jsonb) v) p "
                            "where f.id = any(%s) "
                            "on conflict (field_id) do update set profile = excluded.profile, "
                            "data_versions = excluded.data_versions, computed_at = now()"
                        ).format(fp=ident(S.sim, "field_profile"), f=ident(S.app, "fields")), (ids,)).rowcount
                    out["via"] = "analyze_polygon"
        except Exception as e:  # noqa: BLE001 — recompute failure must not undo the swap
            log.warning("recompute failed: %s", e)
            out["error"] = str(e)
        return out


def run_sources(ctx: RunContext, sources: list[Source]) -> list[JobResult]:
    p = Pipeline(ctx)
    return [p.run(s) for s in sources]


def raw_files(dir_: Path) -> list[Path]:
    return sorted(p for p in dir_.rglob("*") if p.is_file())
