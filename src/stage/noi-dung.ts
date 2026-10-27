/**
 * noi-dung.ts — dữ liệu cảnh v0.1: danh sách place, clip, biểu cảm, emote.
 *
 * Tách riêng khỏi code dựng cảnh để A3 (lab viễn tưởng) chỉ cần thay file này
 * là có bộ place mới, không phải sửa lệnh hay dispatcher.
 *
 * Quy ước đo (spec mục 1b): mét, gốc toạ độ giữa phòng, `facing` độ (0 = hướng
 * camera mặc định, tức nhìn về +Z).
 */
import type { Vec3 } from '../api/types';

export interface DinhNghiaPlace {
  id: string;
  pos: Vec3;
  kind: 'desk' | 'seat' | 'stage' | 'door' | 'shelf';
  /** Chỗ actor đứng khi được gọi tới place này (bàn thì đứng trước bàn). */
  standAt?: Vec3;
  /** Hướng actor quay khi tới (độ). */
  facing?: number;
  /**
   * Cao độ mặt ghế (m, từ sàn) — CHỈ áp cho `kind: 'seat'`. `actor.sit` đặt
   * hips theo đúng số này (xem `NhanVat.ngoi`, review PR #10 vòng 4: hạ gốc
   * theo hằng số × tỉ lệ chân không biết ghế cao bao nhiêu nên lún xuyên).
   * Số khai ở đây khớp mặt ghế thật dựng trong `van-phong.ts`.
   */
  seatY?: number;
}

/** `NhanVat.ngoi`/`world.actorSit` đọc cao độ mặt ghế (khai trong `PLACES`, đo theo `van-phong.ts`). */
export function layMatGhe(id: string): number {
  return timPlace(id)?.seatY ?? 0.335;
}

/**
 * PLACE CỦA VĂN PHÒNG (cảnh mặc định từ 27/10) — CÙNG BỘ ID với căn nhà cũ, chỉ
 * đổi chỗ, để lệnh / não / 12 hoạt động J2 / `MAN_HINH_THAT` chạy tiếp không sửa
 * một dòng. Toạ độ khớp `src/stage/van-phong.ts` (sàn x −12…12 · z −9…8; +Z là
 * phía trước, nơi máy quay đứng; `facing` 0 = nhìn +Z, 180 = nhìn vào trong).
 *
 *   · `ban-dieu-khien` → bàn riêng của Nhi cạnh lối đi chính (màn hình `may-tinh`)
 *   · `ghe-2` → ghế ở bàn đó · `ghe-1` → ghế trống trong Phòng họp
 *   · `ke-module` → kệ thấp giữa Kinh doanh và Phòng họp
 *   · `sofa` → sofa Khu nghỉ · `ban-an` → bàn tròn Pantry · `bep` → quầy Pantry
 *   · `cua` → lối vào phía trước (cạnh Lễ tân) · `cua-so` → cửa sổ tường tây
 *   · `buc-trung-tam`, `ban-1`, `ban-2` → điểm trên lối đi chính (mốc test)
 */
export const PLACES: readonly DinhNghiaPlace[] = [
  { id: 'ban-dieu-khien', pos: [2.6, 0, -4.2], kind: 'desk', standAt: [2.6, 0, -2.9], facing: 180 },
  { id: 'ban-1', pos: [-1.5, 0, -2], kind: 'desk', standAt: [-1.5, 0, -1], facing: 180 },
  { id: 'ban-2', pos: [-1.5, 0, 2.5], kind: 'desk', standAt: [-1.5, 0, 3.5], facing: 0 },
  { id: 'ghe-1', pos: [6.45, 0, -0.72], kind: 'seat', facing: 0, seatY: 0.335 },
  { id: 'ghe-2', pos: [2.6, 0, -3.56], kind: 'seat', facing: 180, seatY: 0.335 },
  { id: 'buc-trung-tam', pos: [0, 0, 1.5], kind: 'stage', facing: 0 },
  { id: 'cua', pos: [3.6, 0, 7.8], kind: 'door', standAt: [3.6, 0, 7.0], facing: 180 },
  { id: 'ke-module', pos: [7.6, 0, -2.7], kind: 'shelf', standAt: [7.0, 0, -2.0], facing: 180 },
  { id: 'sofa', pos: [0.8, 0, -7.06], kind: 'seat', standAt: [1.6, 0, -6.2], facing: 0, seatY: 0.33 },
  { id: 'ban-an', pos: [6.2, 0, 5.4], kind: 'desk', standAt: [6.2, 0, 4.1], facing: 0 },
  { id: 'bep', pos: [11.0, 0, 5.0], kind: 'desk', standAt: [10.1, 0, 4.9], facing: 90 },
  { id: 'cua-so', pos: [-12, 0, 0.4], kind: 'door', standAt: [-10.9, 0, 0.6], facing: 270 },
];

/**
 * Clip tạm của A1: dựng bằng hoạt ảnh thủ công (procedural) có sẵn từ đợt 0.
 * A2 thay bằng thư viện chuyển động thật (Quaternius → VRMA) và mở rộng danh
 * sách; tên clip giữ nguyên nên lệnh không phải đổi.
 */
export const CLIPS = [
  'idle',
  'walk',
  'wave',
  'sit',
  'stand',
  'nod',
  'shake',
  'think',
  'clap',
  'point',
  'celebrate',
  'type',
  'sleep',
] as const;

/** Thời lượng clip (ms) — A2 thay bằng độ dài file chuyển động thật. */
export const DAI_CLIP: Record<string, number> = {
  idle: 400,
  walk: 1200,
  wave: 2600,
  sit: 800,
  stand: 800,
  nod: 1200,
  shake: 1200,
  think: 2400,
  clap: 1800,
  point: 2000,
  celebrate: 2600,
  type: 3000,
  sleep: 4000,
};

export const BIEU_CAM = [
  'neutral',
  'happy',
  'angry',
  'sad',
  'relaxed',
  'surprised',
] as const;

/** Thư viện emote v0.1 theo spec mục 3.2b — A2 thi công, A1 chỉ liệt kê. */
export const EMOTES = [
  'vui',
  'rat-vui',
  'buon',
  'ngac-nhien',
  'gian',
  'suy-nghi',
  'dong-y',
  'tu-choi',
  'chao',
  'ra-lenh',
  'thanh-cong',
  'that-bai',
  'boi-roi',
  'met',
  'cham-chu',
  // C0 (#28) — phản xạ khi Sếp gọi: ngẩng đầu, hơi nghiêng
  'chu-y',
] as const;

export const PRESET_DEN = ['sang', 'toi', 'am'] as const;
/**
 * Góc máy v0.1 lab (spec 3.3): toàn cảnh · bàn điều khiển · cận (hộp).
 *
 * A3 CHỈ THÊM `ban-dieu-khien` — `ban-1`/`ban-2` của A1 vẫn còn (spec mục 3
 * đầu bài: "thêm thì tăng version, không đổi nghĩa lệnh cũ"); cả hai rơi vào
 * nhánh `cameraFocus` fallthrough ở `world.ts` nên không cần code riêng.
 *
 * `truoc-mat` (A2 vòng 2) là góc **chính diện, thấy TRỌN NGƯỜI** — bắt buộc
 * cho ảnh bằng chứng emote: vòng 1 đóng khung ngang ngực nên che đúng vùng
 * tay đang sai (review PR #10 mục 2.6).
 *
 * `theo-owner` (B1, Issue #18) **bám mượt** theo nhân vật có
 * `controlledBy: "owner"`: giữ nguyên góc 3/4 nhìn xuống, chỉ lerp vị trí theo
 * chủ — khác `camera.focus` (bay một lần rồi đứng im) ở chỗ nó bám LIÊN TỤC
 * mỗi khung hình cho tới khi đổi góc máy khác.
 */
export const PRESET_MAY = [
  'toan-canh',
  'theo-owner',
  'ban-dieu-khien',
  'ban-1',
  'ban-2',
  'hop',
  'truoc-mat',
  // D1 (Issue #43): 4 góc máy căn nhà — khai tay trong `world.cameraPreset`
  // (không rơi vào `cameraFocus` chung) để không bị offset chéo cố định đẩy
  // camera xuyên tường khi mục tiêu nằm sát cửa sổ/tường.
  'phong-khach',
  'ban-lam-viec',
  'bep',
  'cua-so',
] as const;

/** Danh sách place (giữ tên hàm: mọi chỗ đọc lúc chạy đi qua đây). */
export function dsPlaces(): readonly DinhNghiaPlace[] {
  return PLACES;
}

export function timPlace(id: string): DinhNghiaPlace | undefined {
  return PLACES.find((p) => p.id === id);
}

/* ------------------------------------------- C2 (#32) — tên gọi nhân vật */

/**
 * TÊN HIỂN THỊ của nhân vật — Boss 28/10: **đổi Gen → "Nhi", Javis → "Nam"**
 * cho dễ gọi/nhận diện (trước đó 26/10 là "Javis").
 *
 * `id` giữ nguyên `owner`/`gen` (KHÔNG đổi) vì cả `controlledBy`, phím WASD,
 * camera `theo-owner`, nguồn `user.text` và MCP đều viết theo id đó — đổi id
 * là phá hợp đồng với agent. Chỉ **tên hiện trên bong bóng chữ và trong
 * `stage.describe().actors[].name`** đổi thành "Nam"/"Nhi".
 */
export const TEN_HIEN_THI: Record<string, string> = {
  owner: 'Nam',
  gen: 'Nhi',
};

/**
 * Bí danh để GỌI nhân vật bằng giọng (C2 — `src/behavior/hieu-lenh.ts`).
 *
 * Viết sẵn cả những cách STT tiếng Việt hay nghe sai: "Javis" rất dễ ra
 * "Ja-vít", "Gia vis", "Gia vít"; "Gen" ra "Ghen"/"Gien". Máy khớp còn cộng
 * thêm fuzzy ≤2 ký tự nên bảng này chỉ cần những biến thể **khác hẳn** chữ gốc.
 *
 * GIỮ nguyên mọi bí danh cũ (`javis`, `gen`, `david`…) — đổi tên hiển thị
 * không được phá câu Sếp quen gọi theo tên cũ.
 *
 * **"Nam"/"Nhi" là từ tiếng Việt thường** ("phía nam", "nam châm", "nhí
 * nhảnh", và cả số đếm — xem `SO_CHU` trong `ngu-phap.ts`: `nhi` = 2, `nam` =
 * 5) nên KHÔNG khai bừa làm bí danh trần một từ: máy khớp (`timCum` trong
 * `hieu-lenh.ts`) tìm cụm ở BẤT KỲ đâu trong câu, khai "nam" trần là "cục nam
 * châm" cũng bị hiểu thành gọi tên. Chỉ khai **cụm có tín hiệu gọi tên rõ**
 * (kèm "ơi"/"à", hoặc "anh"/"em" đứng trước) — những cụm này gần như không
 * bao giờ xuất hiện tình cờ trong câu thường. Trường hợp gọi trần ở **đầu câu
 * kèm dấu phẩy** ("Nam, mở đèn") được xử lý RIÊNG, có ràng buộc vị trí, ngay
 * trong `tachNguoiNhan()` — xem chú thích ở đó.
 */
export const BI_DANH_NHAN_VAT: Record<string, string[]> = {
  /**
   * E1 (#48) việc 6 — **cùng bộ đồng âm với `bridge/so-tu.ts`**.
   *
   * Hai lớp phải khớp nhau: `so-tu.ts` sửa chữ engine nghe được thành "Javis",
   * còn bảng này tách người nhận ra khỏi câu. Engine nghe `david` mà bảng này
   * không biết `david` thì câu vẫn chạy sang Gen — đúng lỗi đo được 26/10
   * (*"Javis, chào"* → Gen chào). Thêm cách nghe mới thì sửa **cả hai chỗ**.
   *
   * `hieu-lenh.ts` chạy `boDau()` trước khi so, nên khai có dấu hay không đều
   * khớp; giữ cả hai dạng cho người đọc dễ soi.
   */
  owner: [
    'javis',
    'ja vit',
    'ja vít',
    'javit',
    'gia vis',
    'gia vit',
    'gia vít',
    'gia viet',
    'gia viết',
    'gia việt',
    'giavis',
    'jarvis',
    'ja vis',
    'da vit',
    'đa vít',
    'david',
    'davids',
    // G2 (28/10) — "Nam" dễ trùng từ thường, chỉ khai cụm có tín hiệu gọi rõ.
    'nam oi',
    'nam ơi',
    'nam a',
    'nam à',
    'anh nam',
    'a nam',
  ],
  gen: [
    'gen',
    'ghen',
    /*
     * G3 (#67) — BỎ `gien`. Máy khớp cộng fuzzy ≤1 ký tự cho từ 4 ký tự
     * (`nguong()` trong `ngu-phap.ts`), nên `gien` bắt luôn **`mien`**: đo thật
     * trên bộ TTS bẩn thấy "**miền nam** …" bị hiểu thành gọi Nhi. "Gien" vốn
     * chỉ là một cách viết của "Gen" mà `gen` + fuzzy đã phủ gần hết.
     */
    'jen',
    'gel',
    // G2 (28/10) — "Nhi" dễ trùng từ thường ("nhí", số đếm), chỉ khai cụm có
    // tín hiệu gọi rõ.
    'nhi oi',
    'nhi ơi',
    'nhi a',
    'nhi à',
    'em nhi',
  ],
};
