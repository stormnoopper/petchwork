import type { FieldProfile } from '@rice/contracts';
import th from '@/messages/th.json';
import { fmt } from './fmt';

/** "ต.… อ.… จ.…" (province only when lower levels are unknown). */
export function locationLabel(profile: Pick<FieldProfile, 'admin'>): string {
  const a = profile.admin;
  if (a.subdistrict_name_th && a.district_name_th) {
    return fmt(th.results.location, {
      sub: a.subdistrict_name_th,
      district: a.district_name_th,
      province: a.province_name_th,
    });
  }
  return fmt(th.results.locationProvinceOnly, { province: a.province_name_th });
}
