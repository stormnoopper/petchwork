"""Thai province codes (DOPA 2-digit == GISTDA PV_CODE == seed codes '44','40','72').

Used to map DGR CKAN resource names ("แผนที่น้ำบาดาล จังหวัดมหาสารคาม") to codes,
and to filter ThaiWater records. Names follow GISTDA L05_Province_GISTDA_50k PV_TN.
"""
from __future__ import annotations

import re

PROVINCES: dict[str, str] = {
    "10": "กรุงเทพมหานคร", "11": "สมุทรปราการ", "12": "นนทบุรี", "13": "ปทุมธานี", "14": "พระนครศรีอยุธยา",
    "15": "อ่างทอง", "16": "ลพบุรี", "17": "สิงห์บุรี", "18": "ชัยนาท", "19": "สระบุรี",
    "20": "ชลบุรี", "21": "ระยอง", "22": "จันทบุรี", "23": "ตราด", "24": "ฉะเชิงเทรา", "25": "ปราจีนบุรี",
    "26": "นครนายก", "27": "สระแก้ว",
    "30": "นครราชสีมา", "31": "บุรีรัมย์", "32": "สุรินทร์", "33": "ศรีสะเกษ", "34": "อุบลราชธานี", "35": "ยโสธร",
    "36": "ชัยภูมิ", "37": "อำนาจเจริญ", "38": "บึงกาฬ", "39": "หนองบัวลำภู", "40": "ขอนแก่น", "41": "อุดรธานี",
    "42": "เลย", "43": "หนองคาย", "44": "มหาสารคาม", "45": "ร้อยเอ็ด", "46": "กาฬสินธุ์", "47": "สกลนคร",
    "48": "นครพนม", "49": "มุกดาหาร",
    "50": "เชียงใหม่", "51": "ลำพูน", "52": "ลำปาง", "53": "อุตรดิตถ์", "54": "แพร่", "55": "น่าน", "56": "พะเยา",
    "57": "เชียงราย", "58": "แม่ฮ่องสอน",
    "60": "นครสวรรค์", "61": "อุทัยธานี", "62": "กำแพงเพชร", "63": "ตาก", "64": "สุโขทัย", "65": "พิษณุโลก",
    "66": "พิจิตร", "67": "เพชรบูรณ์",
    "70": "ราชบุรี", "71": "กาญจนบุรี", "72": "สุพรรณบุรี", "73": "นครปฐม", "74": "สมุทรสาคร", "75": "สมุทรสงคราม",
    "76": "เพชรบุรี", "77": "ประจวบคีรีขันธ์",
    "80": "นครศรีธรรมราช", "81": "กระบี่", "82": "พังงา", "83": "ภูเก็ต", "84": "สุราษฎร์ธานี", "85": "ระนอง",
    "86": "ชุมพร", "90": "สงขลา", "91": "สตูล", "92": "ตรัง", "93": "พัทลุง", "94": "ปัตตานี", "95": "ยะลา",
    "96": "นราธิวาส",
}

# GISTDA RE_ROYIN → ref.admin_boundaries.region (6-region scheme of the Royal Institute)
REGION_MAP = {
    "north": "north", "northeast": "northeast", "central": "central",
    "east": "east", "west": "west", "south": "south",
}

_ALIASES = {"กรุงเทพ": "10", "กทม": "10"}


def code_from_name(text: str) -> str | None:
    """Find a province code in free text such as 'แผนที่น้ำบาดาล จังหวัดมหาสารคาม'."""
    t = re.sub(r"\s+", "", text or "")
    # longest names first so 'นครพนม' does not match inside something longer
    for code, name in sorted(PROVINCES.items(), key=lambda kv: -len(kv[1])):
        if name in t:
            return code
    for alias, code in _ALIASES.items():
        if alias in t:
            return code
    return None


def region(re_royin: str | None) -> str | None:
    return REGION_MAP.get((re_royin or "").strip().lower())
