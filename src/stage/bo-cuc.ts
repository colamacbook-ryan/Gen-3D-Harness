/**
 * bo-cuc.ts — VA CHẠM + TÌM ĐƯỜNG trên mặt sàn của cảnh đang dựng. Dữ liệu
 * thuần, KHÔNG `import three`.
 *
 * Từ 27/10 (Ryan: "xoá cảnh nhà cũ và làng đi") cảnh duy nhất là VĂN PHÒNG búp
 * bê (`van-phong.ts`). Bảng bố cục căn nhà (`KHOI_CANH`, các `kiem*()` của
 * D1/F1/J1) đã bỏ cùng `phong.ts`: văn phòng tự ĐO hộp nội thất lúc dựng rồi
 * nạp vào đây bằng `datCanhChan`. Một chỗ duy nhất cho va chạm:
 * `actor.steer`, `actor.moveTo`, `actor.sit` đều qua `truotVaCham` →
 * `biChan` + `kepTrongPhong`; `moveTo`/`sit` đi theo đường `timDuong` (A*).
 */

/** Khung sàn văn phòng (m) — mép sàn diorama. Trước khi cảnh dựng xong thì chưa có vật cản. */
export const SAN_MAC_DINH = { x0: -12, x1: 12, z0: -9, z1: 8 } as const;
/** Lề tường: actor không đi sát mép sàn hơn số này (m). */
export const LE_TUONG = 0.5;

/** Hộp chắn đường trên mặt sàn (m). */
export interface HopChan {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Vật cản + khung sàn của cảnh đang dựng. */
export interface CanhChan {
  hop: readonly HopChan[];
  /** Khung sàn (m) — đã là MÉP, `kepTrongPhong` tự trừ `LE_TUONG`. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const MAC_DINH: CanhChan = { hop: [], ...SAN_MAC_DINH };
let canhChan: CanhChan = MAC_DINH;

/** `world.ts` gọi sau khi dựng cảnh; `null` = sàn văn phòng trống (test dùng để dọn). */
export function datCanhChan(c: CanhChan | null): void {
  canhChan = c ?? MAC_DINH;
}

/** Bộ hộp chắn đang có hiệu lực. */
export function hopChanHienTai(): readonly HopChan[] {
  return canhChan.hop;
}

/** Trong sàn (đã trừ lề) thì giữ nguyên, ngoài thì kẹp vào. */
export function kepTrongPhong(x: number, z: number): [number, number] {
  const c = canhChan;
  return [
    Math.max(c.x0 + LE_TUONG, Math.min(c.x1 - LE_TUONG, x)),
    Math.max(c.z0 + LE_TUONG, Math.min(c.z1 - LE_TUONG, z)),
  ];
}

/** Điểm (x, z) có nằm trong một hộp chắn nào không (nở thêm `banKinh` m). */
export function biChan(x: number, z: number, banKinh = 0.3): string | null {
  for (const h of hopChanHienTai()) {
    if (x > h.x0 - banKinh && x < h.x1 + banKinh && z > h.z0 - banKinh && z < h.z1 + banKinh) {
      return h.id;
    }
  }
  return null;
}

/**
 * Trượt dọc vật cản: thử dời theo trục X trước, rồi trục Z.
 *
 * Giải từng trục (chứ không huỷ cả bước đi) để nhân vật **men theo mép bàn**
 * thay vì dính cứng khi đi chéo vào góc — đúng cảm giác điều khiển mượt, và
 * không cần thư viện vật lý nào. (Giữ nguyên từ B1, Issue #18.)
 */
export function truotVaCham(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  banKinh = 0.3,
): [number, number] {
  const [cx, cz] = kepTrongPhong(x1, z1);
  let x = x0;
  let z = z0;
  if (!biChan(cx, z, banKinh)) x = cx;
  if (!biChan(x, cz, banKinh)) z = cz;
  // bị chặn cả hai trục: đứng yên tại chỗ cũ (không đẩy xuyên)
  return [x, z];
}

/* ------------------------------------------------------------ tìm đường (A*) */

/** Cỡ ô lưới tìm đường (m). Nhỏ hơn bán kính thân (0,34) để lọt khe giữa hai cụm bàn. */
export const O_TIM_DUONG = 0.25;

/** Đoạn thẳng a→b có thoáng không (lấy mẫu mỗi 0,1 m, nở `banKinh`). */
export function thongDuong(ax: number, az: number, bx: number, bz: number, banKinh: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1));
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    if (biChan(ax + (bx - ax) * t, az + (bz - az) * t, banKinh)) return false;
  }
  return true;
}

/**
 * ĐƯỜNG ĐI tránh vật cản từ (x0,z0) tới (x1,z1) — A* trên lưới `O_TIM_DUONG`,
 * 8 hướng (không cắt góc), rồi kéo căng (bỏ điểm thừa bằng `thongDuong`).
 *
 * Văn phòng 27/10: `moveTo` cũ đi THẲNG rồi trượt mép — căn nhà trống thì đủ,
 * văn phòng nhiều cụm bàn thì kẹt giữa đường (đo thật: lối vào → `ke-module`
 * dừng ở Pantry, lệch 7,8 m). Trả về các điểm SAU điểm xuất phát, điểm cuối là
 * đích (hoặc ô thoáng gần đích nhất nếu chính đích bị chắn — vd ghế sát bàn).
 * Đường thẳng thoáng sẵn → đúng một điểm, hành vi y như trước.
 */
export function timDuong(x0: number, z0: number, x1: number, z1: number, banKinh = 0.34): Array<[number, number]> {
  if (thongDuong(x0, z0, x1, z1, banKinh)) return [[x1, z1]];
  const c = canhChan;
  const bx0 = c.x0 + LE_TUONG;
  const bx1 = c.x1 - LE_TUONG;
  const bz0 = c.z0 + LE_TUONG;
  const bz1 = c.z1 - LE_TUONG;
  const O = O_TIM_DUONG;
  const nx = Math.floor((bx1 - bx0) / O) + 1;
  const nz = Math.floor((bz1 - bz0) / O) + 1;
  const oX = (x: number) => Math.max(0, Math.min(nx - 1, Math.round((x - bx0) / O)));
  const oZ = (z: number) => Math.max(0, Math.min(nz - 1, Math.round((z - bz0) / O)));
  const tamX = (i: number) => bx0 + i * O;
  const tamZ = (j: number) => bz0 + j * O;
  /*
   * Lưới chừa thêm LỀ `LE_DUONG` ngoài bán kính thân: đường đi sát mép đúng bằng
   * bán kính thì lúc đi thật `truotVaCham` giữ lại ở khe hẹp (đo thật: kẹt giữa
   * chậu cây và kệ cạnh Pantry, rồi kẹt luôn ở mọi lệnh sau).
   */
  const LE_DUONG = 0.08;
  const trong = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) trong[j * nx + i] = biChan(tamX(i), tamZ(j), banKinh + LE_DUONG) ? 0 : 1;
  let si = oX(x0);
  let sj = oZ(z0);
  // đang đứng sát/kẹt trong vùng chừa lề → đi ra ô thoáng gần nhất trước (lối thoát)
  let thoat: [number, number] | null = null;
  if (!trong[sj * nx + si]) {
    let tot = Infinity;
    for (let j = Math.max(0, sj - 8); j <= Math.min(nz - 1, sj + 8); j += 1)
      for (let i = Math.max(0, si - 8); i <= Math.min(nx - 1, si + 8); i += 1) {
        if (!trong[j * nx + i]) continue;
        const d = Math.hypot(tamX(i) - x0, tamZ(j) - z0);
        if (d < tot) {
          tot = d;
          thoat = [i, j];
        }
      }
    if (thoat) [si, sj] = thoat;
    else trong[sj * nx + si] = 1;
  }
  // đích bị chắn → ô thoáng gần đích nhất
  let gi = oX(x1);
  let gj = oZ(z1);
  let dichThat = true;
  if (!trong[gj * nx + gi]) {
    dichThat = false;
    let tot = Infinity;
    for (let j = 0; j < nz; j += 1)
      for (let i = 0; i < nx; i += 1) {
        if (!trong[j * nx + i]) continue;
        const d = Math.hypot(tamX(i) - x1, tamZ(j) - z1);
        if (d < tot) {
          tot = d;
          gi = i;
          gj = j;
        }
      }
    if (!Number.isFinite(tot)) return [[x1, z1]];
  }
  // A*
  const N = nx * nz;
  const g = new Float64Array(N).fill(Infinity);
  const cha = new Int32Array(N).fill(-1);
  const dong = new Uint8Array(N);
  const h = (k: number) => Math.hypot((k % nx) - gi, Math.floor(k / nx) - gj);
  const s0 = sj * nx + si;
  const muc = gj * nx + gi;
  g[s0] = 0;
  const mo: number[] = [s0];
  const f = new Float64Array(N).fill(Infinity);
  f[s0] = h(s0);
  while (mo.length) {
    let bi = 0;
    for (let q = 1; q < mo.length; q += 1) if (f[mo[q]!]! < f[mo[bi]!]!) bi = q;
    const k = mo[bi]!;
    mo[bi] = mo[mo.length - 1]!;
    mo.pop();
    if (k === muc) break;
    if (dong[k]) continue;
    dong[k] = 1;
    const ki = k % nx;
    const kj = Math.floor(k / nx);
    for (let dj = -1; dj <= 1; dj += 1)
      for (let di = -1; di <= 1; di += 1) {
        if (!di && !dj) continue;
        const ni = ki + di;
        const nj = kj + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const nk = nj * nx + ni;
        if (!trong[nk] || dong[nk]) continue;
        if (di && dj && (!trong[kj * nx + ni] || !trong[nj * nx + ki])) continue; // không cắt góc
        const ng = g[k]! + (di && dj ? Math.SQRT2 : 1);
        if (ng < g[nk]!) {
          g[nk] = ng;
          cha[nk] = k;
          f[nk] = ng + h(nk);
          mo.push(nk);
        }
      }
  }
  let dich = muc;
  if (cha[muc] === -1 && muc !== s0) {
    // đích không nối được với chỗ đứng → tới ô ĐÃ TỚI ĐƯỢC gần đích nhất (không đi thẳng cho kẹt)
    let tot = Infinity;
    for (let k = 0; k < N; k += 1) {
      if (!dong[k] && k !== s0) continue;
      const d = Math.hypot(tamX(k % nx) - x1, tamZ(Math.floor(k / nx)) - z1);
      if (d < tot) {
        tot = d;
        dich = k;
      }
    }
    dichThat = false;
    if (dich === s0) return thoat ? [[tamX(thoat[0]), tamZ(thoat[1])]] : [[x0, z0]];
  }
  const o: Array<[number, number]> = [];
  for (let k = dich; k !== -1 && k !== s0; k = cha[k]!) o.push([tamX(k % nx), tamZ(Math.floor(k / nx))]);
  o.reverse();
  if (dichThat) o[o.length - 1] = [x1, z1];
  // kéo căng: từ điểm hiện tại nhảy tới điểm XA NHẤT còn thông (giữ đủ lề)
  const ra: Array<[number, number]> = [];
  let cx = x0;
  let cz = z0;
  if (thoat) {
    cx = tamX(thoat[0]);
    cz = tamZ(thoat[1]);
    ra.push([cx, cz]);
  }
  let i = 0;
  while (i < o.length) {
    let xa = i;
    for (let k = o.length - 1; k > i; k -= 1)
      if (thongDuong(cx, cz, o[k]![0], o[k]![1], banKinh + LE_DUONG / 2)) {
        xa = k;
        break;
      }
    ra.push(o[xa]!);
    [cx, cz] = o[xa]!;
    i = xa + 1;
  }
  return ra;
}
