/**
 * canh-chung.ts — phần DÙNG CHUNG của việc dựng cảnh, tách ra khi xoá căn nhà
 * D1b/J1 (`phong.ts`) và bản thử làng (`lang.ts`) ngày 27/10 (Ryan: "xoá cảnh
 * nhà cũ và làng đi"). Văn phòng búp bê là cảnh duy nhất; nó vẫn cần:
 * - `gopTinh()` gộp mesh tĩnh theo vật liệu (ngân sách lượt vẽ, L-42),
 * - `denDiem()`, các hằng màu ấm mà `scene.light` / `module.build` dùng,
 * - `vanBongDat()` — vệt bóng tiếp xúc dưới chân đồ vật/búp bê,
 * - kiểu `Canh` mà `World` đọc (sổ đo lúc dựng + vật cản + khung sàn).
 */
import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Màu ấm dùng chung (tên cũ giữ vì `world.ts` `scene.light` + `module.build` đọc). */
export const MAU_CAM = 0xf2b26b;
export const MAU_CYAN = 0xf6d9a0;
export const MAU_DEN_AM = 0xffd9a8;

export type HopChan = { id: string; x0: number; x1: number; z0: number; z1: number };

/** Kết quả dựng cảnh — `World` nạp sổ đo, vật cản, khung sàn từ đây. */
export interface Canh {
  nhom: THREE.Group;
  /** Mặt trên của khối, đo lúc dựng (m) — `gopTinh()` dọn nhóm nên không đo lại được trên cảnh. */
  noc: Map<string, number>;
  day: Map<string, number>;
  matNgoi: Map<string, number>;
  hopKhoi: Map<string, { min: [number, number, number]; max: [number, number, number] }>;
  /** Số mesh trước/sau khi gộp tĩnh — bằng chứng hiệu năng. */
  gop: { truoc: number; sau: number };
  /** Vị trí đèn ấm (thế giới) — `World` đặt vài đèn điểm thật ở đây. */
  denLong: THREE.Vector3[];
  /** Hộp vật cản đo lúc dựng — `World` nạp vào `bo-cuc.datCanhChan`. */
  vatCan: HopChan[];
  /** Khung sàn (mép) của cảnh. */
  khungSan: { x0: number; x1: number; z0: number; z1: number };
}

/** Bóng tiếp xúc: vệt tối mềm dưới chân đồ vật — "neo" vật xuống đất. */
export function vanBongDat(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.75)');
  gr.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ---------------------------------------------------------- gộp mesh tĩnh */

/**
 * Chỉ giữ 4 thuộc tính chuẩn (`position`, `normal`, `uv`, `color`) để
 * `mergeGeometries` không từ chối vì lệch khuôn.
 *
 * `color` là mấu chốt vòng 2: màu phẳng của model Kenney được **nướng vào màu
 * đỉnh**, nhờ đó 119 vật liệu "khác nhau chỉ ở `color`" gộp được về vài bản
 * duy nhất (xem `gopTinh`).
 */
function chuanHoaThuocTinh(
  geo: THREE.BufferGeometry,
  mau: THREE.Color,
): THREE.BufferGeometry | null {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = g.getAttribute('position');
  if (!pos) return null;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  for (const ten of Object.keys(g.attributes)) {
    if (ten !== 'position' && ten !== 'normal' && ten !== 'uv') g.deleteAttribute(ten);
  }
  // màu đỉnh = `material.color` (đang ở không gian LÀM VIỆC, đúng cái three
  // mong đợi ở `vertexColors`), nên `color` × `vertexColor` không nhân hai lần
  // miễn là vật liệu gộp để `color` trắng.
  const mc = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    mc[i * 3] = mau.r;
    mc[i * 3 + 1] = mau.g;
    mc[i * 3 + 2] = mau.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(mc, 3));
  g.clearGroups();
  g.morphAttributes = {};
  return g;
}

/**
 * KHOÁ GỘP: hai vật liệu chỉ gộp được khi mọi thứ ảnh hưởng tới shader/uniform
 * giống nhau — **trừ `color`**, vì `color` đã được nướng vào màu đỉnh.
 *
 * Trả `null` nghĩa là "không gộp cái này" (đã có màu đỉnh riêng thì nướng thêm
 * sẽ sai màu).
 */
function khoaGop(m: THREE.Material, bong: boolean): string | null {
  const s = m as unknown as Record<string, unknown>;
  if (s.vertexColors) return null;
  const t = (x: unknown) => (x && (x as THREE.Texture).uuid ? (x as THREE.Texture).uuid : '-');
  return [
    m.type,
    bong ? 1 : 0,
    t(s.map),
    t(s.roughnessMap),
    t(s.normalMap),
    t(s.aoMap),
    t(s.alphaMap),
    t(s.emissiveMap),
    t(s.metalnessMap),
    t(s.lightMap),
    String(s.roughness ?? '-'),
    String(s.metalness ?? '-'),
    s.emissive ? (s.emissive as THREE.Color).getHexString() : '-',
    String(s.emissiveIntensity ?? '-'),
    m.transparent ? 1 : 0,
    m.opacity,
    m.side,
    m.blending,
    m.depthWrite ? 1 : 0,
    m.alphaTest,
    s.flatShading ? 1 : 0,
    s.toneMapped === false ? 0 : 1,
    // vật liệu có `onBeforeCompile` (vân phủ bằng shader) chỉ gộp với vật liệu
    // dùng ĐÚNG shader đó — `customProgramCacheKey` chính là chữ ký ấy.
    m.customProgramCacheKey ? m.customProgramCacheKey() : '-',
  ].join('|');
}

/**
 * Gộp mọi mesh **tĩnh, không đổ bóng** theo VẬT LIỆU — đây là mấu chốt hiệu
 * năng của D1b: nhà đầy đồ mà máy yếu vẫn chạy.
 *
 * Nhờ `apChatLieu()` dùng chung một bản vật liệu cho mọi mesh cùng gốc, số
 * nhóm vật liệu nhỏ hơn số mesh rất nhiều → gộp xong còn vài chục lượt vẽ.
 * Mesh nào `castShadow` (nội thất lớn) thì KHÔNG gộp: gộp vào một mesh khổng
 * lồ làm khung bóng phải vẽ cả cái, mất cái lợi vừa kiếm được.
 */
export function gopTinh(goc: THREE.Object3D): { truoc: number; sau: number } {
  const theoVatLieu = new Map<
    string,
    { vl: THREE.Material; bong: boolean; geo: THREE.BufferGeometry[]; nhan: THREE.Mesh[] }
  >();
  let truoc = 0;
  goc.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    truoc++;
    if (Array.isArray(m.material) || m.userData.khongGop) return;
    // InstancedMesh (hàng rào, tán cây) đã là MỘT lượt vẽ cho cả trăm bản —
    // gộp nó là phá: `mergeGeometries` chỉ lấy hình gốc ở gốc toạ độ.
    if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    const vl = m.material as THREE.Material;
    if (!vl) return;
    /*
     * Gộp theo (chữ ký vật liệu BỎ MÀU, có đổ bóng hay không). Vòng 1 khoá
     * theo `vl.uuid` nên 119 vật liệu Kenney "khác nhau chỉ ở `color`" không
     * gộp được gì → phần nhà còn ~190 lượt vẽ (kiểm độc lập chặn). Vòng 2
     * nướng `color` vào màu đỉnh, chữ ký còn lại chỉ là (texture, nhám, kim,
     * trong suốt, shader) → gộp cả dãy đồ gỗ thành MỘT mesh.
     *
     * Một mesh gộp chỉ mang được MỘT cờ `castShadow`, nên đồ lớn (vào khung
     * bóng) và đồ nhỏ (không) vẫn phải nằm hai rổ khác nhau.
     */
    const khoa = khoaGop(vl, m.castShadow);
    if (khoa === null) return;
    if (!theoVatLieu.has(khoa)) {
      theoVatLieu.set(khoa, { vl, bong: m.castShadow, geo: [], nhan: [] });
    }
    const o2 = theoVatLieu.get(khoa)!;
    m.updateWorldMatrix(true, false);
    const mau = (vl as THREE.MeshStandardMaterial).color ?? new THREE.Color(0xffffff);
    const g = chuanHoaThuocTinh(m.geometry, mau);
    if (!g) return;
    g.applyMatrix4(m.matrixWorld);
    o2.geo.push(g);
    o2.nhan.push(m);
  });

  for (const { vl, bong, geo, nhan } of theoVatLieu.values()) {
    if (geo.length < 2) continue;
    let gop: THREE.BufferGeometry | null = null;
    try {
      gop = BGU.mergeGeometries(geo, false);
    } catch {
      gop = null;
    }
    if (!gop) continue;
    for (const m of nhan) m.removeFromParent();
    // Vật liệu GỘP: `color` trắng + `vertexColors` — màu từng món nằm trong
    // thuộc tính `color` của hình học, nên không nhân màu hai lần.
    const vlGop = vl.clone();
    const vs = vlGop as THREE.MeshStandardMaterial;
    if (vs.color) vs.color.setRGB(1, 1, 1);
    // `Material.copy()` KHÔNG mang theo `onBeforeCompile`/`customProgramCacheKey`
    // (chúng là thuộc tính riêng do `phuVanLenMap` gắn) — mất là mất sạch vân.
    vlGop.onBeforeCompile = vl.onBeforeCompile;
    vlGop.customProgramCacheKey = vl.customProgramCacheKey;
    vlGop.vertexColors = true;
    vlGop.needsUpdate = true;
    const moi = new THREE.Mesh(gop, vlGop);
    moi.name = 'gop-tinh';
    moi.castShadow = bong;
    moi.receiveShadow = true;
    moi.matrixAutoUpdate = false;
    goc.add(moi);
  }

  let sau = 0;
  goc.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) sau++;
  });
  return { truoc, sau };
}

/** PointLight dựng gọn một dòng (bảng bố cục không quản ánh sáng). */
export function denDiem(
  mau: number,
  cuong: number,
  xa: number,
  x: number,
  y: number,
  z: number,
): THREE.PointLight {
  const d = new THREE.PointLight(mau, cuong, xa, 2);
  d.position.set(x, y, z);
  return d;
}
