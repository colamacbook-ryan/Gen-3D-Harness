/**
 * VĂN PHÒNG GEN LABS — diorama búp bê (Ryan 27/10: "chất lượng cao hơn, trong
 * không gian một công ty lớn có các khu phòng ban rõ ràng nhưng không cần ngăn
 * vách").
 *
 * Phân khu KHÔNG bằng vách: mỗi phòng ban một màu thảm sàn + một biển tên đứng,
 * ngăn mềm bằng chậu cây / kệ thấp. Một sàn mở 24 × 17 m đặt trên ĐẾ dày như mô
 * hình diorama, hai tường sau (bắc, tây) cắt thấp có cửa sổ sáng, hai phía còn
 * lại mở cho máy quay nhìn vào.
 *
 * Tỉ lệ là của búp bê (cao ~1 m): bàn 0,48 m, mặt ghế 0,3 m — người búp bê ngồi
 * vừa khít, giống bài học G1 "nội thất là của người chibi".
 *
 * Ngân sách: mọi thứ tĩnh (kể cả nhân viên búp bê ngồi làm việc) gộp qua
 * `gopTinh()` theo vật liệu; vật liệu dùng chung theo màu nên gộp được nhiều.
 * Khối bo tròn (`RoundedBoxGeometry`) là thứ làm ra cảm giác "đồ chơi cao cấp".
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gopTinh, vanBongDat, type Canh } from './canh-chung';
import { BupBe, NHAN_VIEN } from './bup-be';
import type { HopChan } from './bo-cuc';

/* ---------------------------------------------------------------- kích thước */

export const SAN_VP = { x0: -12, x1: 12, z0: -9, z1: 8 };
const CAO_TUONG = 2.3;
const CAO_BAN = 0.48;
const CAO_GHE = 0.3;

/** Các phòng ban — dữ liệu thuần: tên, màu thảm, hình chữ nhật trên sàn. */
export const KHU_VP = [
  { id: 'ky-thuat', ten: 'Kỹ thuật', mau: 0x7f95b3, x0: -11.4, x1: -3.6, z0: -8.4, z1: -1.4 },
  { id: 'thiet-ke', ten: 'Thiết kế', mau: 0xd9a27f, x0: -11.4, x1: -3.6, z0: 0.6, z1: 7.2 },
  { id: 'kinh-doanh', ten: 'Kinh doanh', mau: 0x9fb78f, x0: 4.6, x1: 11.4, z0: -8.4, z1: -3.4 },
  { id: 'phong-hop', ten: 'Phòng họp', mau: 0xbfb2a2, x0: 4.6, x1: 11.4, z0: -2.0, z1: 2.6 },
  { id: 'pantry', ten: 'Pantry', mau: 0xe9dcc2, x0: 4.6, x1: 11.4, z0: 4.0, z1: 7.2 },
  { id: 'le-tan', ten: 'Lễ tân', mau: 0x46557c, x0: -2.4, x1: 2.6, z0: 4.8, z1: 7.4 },
  { id: 'khu-nghi', ten: 'Khu nghỉ', mau: 0xc9b6d6, x0: -2.4, x1: 3.4, z0: -5.2, z1: -1.9 },
  /** INT-07 — lãnh đạo ngồi LƯNG TỰA TƯỜNG bắc (Ryan 27/10), dưới logo công ty, mặt nhìn ra văn phòng. */
  { id: 'ban-giam-doc', ten: 'Ban giám đốc', mau: 0x7d8aa8, x0: -2.4, x1: 3.4, z0: -8.9, z1: -6.4 },
] as const;

/**
 * INT-07 — toạ độ bàn lãnh đạo (một nguồn: `noi-dung.ts` PLACES + `man-hinh.ts`
 * khớp các số này; test soi). Bàn ở `Z_BAN_LANH_DAO`, ghế phía tường, người
 * nhìn +Z. Ghế không lùi sát tường hơn được: khung sàn chừa `LE_TUONG` 0,5 m
 * (điểm ngồi z ≥ −8,5), nên một DÃY TỦ HỒ SƠ áp tường lấp khe — lưng ghế tựa
 * vào tủ, tủ áp tường.
 */
export const X_BAN_CEO = 0.5;
export const X_BAN_NHI = -1.5;
export const Z_BAN_LANH_DAO = -7.72;
/**
 * Ghế lãnh đạo lùi 0,56 m sau tâm bàn (ghế nhân viên 0,48): điểm ngồi −8,44 phải
 * cách mép sau bàn ≥ thân + lề (không thì A* không vào được ghế CEO — đo thật) và
 * đầu gối không lòi lên mặt bàn (ảnh thật: chân Nhi "gác lên bàn" ở 0,48).
 */
const GHE_LANH_DAO = -0.56;

/* ---------------------------------------------------------------- vật liệu */

const boVl = new Map<string, THREE.MeshStandardMaterial>();
function vl(color: number, roughness = 0.7, them: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const k = `${color}|${roughness}|${JSON.stringify(Object.keys(them))}`;
  let v = boVl.get(k);
  if (!v) {
    v = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...them });
    boVl.set(k, v);
  }
  return v;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement, lap = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (lap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Sàn gỗ sồi sáng ván dài. */
function vanSanGo(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  let s = 7;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
  const h = 512 / 8;
  for (let i = 0; i < 8; i += 1) {
    let x = -r() * 300;
    while (x < 512) {
      const w = 220 + r() * 160;
      const v = 205 + Math.floor(r() * 22);
      g.fillStyle = `rgb(${v},${v - 28},${v - 62})`;
      g.fillRect(x, i * h, w, h);
      g.fillStyle = 'rgba(120,80,40,0.08)';
      for (let k = 0; k < 6; k += 1) g.fillRect(x, i * h + r() * h, w, 1.5);
      g.fillStyle = 'rgba(90,60,30,0.35)';
      g.fillRect(x, i * h, 2, h);
      x += w;
    }
    g.fillStyle = 'rgba(90,60,30,0.35)';
    g.fillRect(0, i * h, 512, 2);
  }
  const t = texture(c, true);
  t.repeat.set(5, 5);
  return t;
}

/** Thảm sàn: sợi mịn cùng màu, viền đậm hơn. */
function vanTham(mau: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const m = new THREE.Color(mau);
  g.fillStyle = `#${m.getHexString()}`;
  g.fillRect(0, 0, 256, 256);
  let s = mau;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
  for (let i = 0; i < 4000; i += 1) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  return texture(c, true);
}

/** Biển tên phòng ban: chữ trắng đậm trên nền màu khu, bo góc. */
function vanBien(ten: string, mau: number): THREE.CanvasTexture {
  const [c, g] = canvas(512, 160);
  const m = new THREE.Color(mau).multiplyScalar(0.72);
  g.fillStyle = '#fbf6ec';
  g.fillRect(0, 0, 512, 160);
  g.fillStyle = `#${m.getHexString()}`;
  g.beginPath();
  g.roundRect(10, 10, 492, 140, 26);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = 'bold 74px "Segoe UI", "Noto Sans", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ten, 256, 84);
  return texture(c);
}

/** Màn hình máy tính: nền tối + vài dòng code/biểu đồ sáng. */
function vanManHinh(kieu: number): THREE.CanvasTexture {
  const [c, g] = canvas(128, 80);
  g.fillStyle = '#1d2433';
  g.fillRect(0, 0, 128, 80);
  if (kieu % 3 === 0) {
    const mau = ['#7fd1ff', '#ffd27f', '#a6e3a1', '#f5a3c7'];
    for (let i = 0; i < 9; i += 1) {
      g.fillStyle = mau[i % 4]!;
      g.fillRect(8 + (i % 3) * 6, 8 + i * 7, 20 + ((i * 37) % 70), 3);
    }
  } else if (kieu % 3 === 1) {
    for (let i = 0; i < 7; i += 1) {
      g.fillStyle = ['#7fd1ff', '#a6e3a1', '#ffd27f'][i % 3]!;
      const h = 12 + ((i * 29) % 46);
      g.fillRect(10 + i * 16, 70 - h, 10, h);
    }
  } else {
    g.fillStyle = '#f2efe6';
    g.fillRect(10, 10, 108, 60);
    g.fillStyle = '#e8a87c';
    g.fillRect(18, 18, 40, 40);
    g.fillStyle = '#85c1e9';
    g.beginPath();
    g.arc(86, 38, 18, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c);
}

/** Cửa sổ: trời chiều sáng + khung chia ô (dùng làm emissive). */
function vanCuaSo(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 160);
  const gr = g.createLinearGradient(0, 0, 0, 160);
  gr.addColorStop(0, '#ffe2b8');
  gr.addColorStop(1, '#fff3dc');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#5b4636';
  g.fillRect(0, 0, 128, 8);
  g.fillRect(0, 152, 128, 8);
  g.fillRect(0, 0, 8, 160);
  g.fillRect(120, 0, 8, 160);
  g.fillRect(60, 0, 8, 160);
  g.fillRect(0, 76, 128, 6);
  return texture(c);
}

/** Bảng logo GEN LABS trên tường sau. */
function vanLogo(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 160);
  g.fillStyle = '#26314f';
  g.beginPath();
  g.roundRect(0, 0, 512, 160, 30);
  g.fill();
  g.fillStyle = '#ffd27f';
  g.beginPath();
  g.arc(90, 80, 44, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#26314f';
  g.font = 'bold 56px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('G', 90, 84);
  g.fillStyle = '#fdf8ee';
  g.font = 'bold 68px "Segoe UI", "Noto Sans", sans-serif';
  g.textAlign = 'left';
  g.fillText('GEN LABS', 158, 86);
  return texture(c);
}

/** Vệt sáng tròn mềm cho vũng sáng đèn. */
function vanVung(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.4)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return texture(c);
}

/* ---------------------------------------------------------------- tiện ích */

interface Bo {
  nhom: THREE.Group;
  /** Hộp vật cản ĐO lúc dựng — mỗi con trực tiếp của một món nội thất một hộp. */
  vatCan: HopChan[];
  den: THREE.Vector3[];
  chan: Array<{ id: string; min: [number, number, number]; max: [number, number, number] }>;
  bong: THREE.MeshBasicMaterial;
}

function hop(
  cha: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  r = 0.03,
  bong = true,
): THREE.Mesh {
  const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const geo = rr > 0.004 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = bong;
  mesh.receiveShadow = true;
  cha.add(mesh);
  return mesh;
}

function tru(cha: THREE.Object3D, r0: number, r1: number, h: number, m: THREE.Material, x: number, y: number, z: number, bong = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 16), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = bong;
  mesh.receiveShadow = true;
  cha.add(mesh);
  return mesh;
}

function bongDat(b: Bo, cha: THREE.Object3D, x: number, z: number, rx: number, rz: number, quay = 0): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), b.bong);
  m.rotation.set(-Math.PI / 2, 0, quay);
  m.position.set(x, 0.012, z);
  m.renderOrder = 1;
  cha.add(m);
}

/**
 * Đặt một nhóm con tại (x, z) quay `quay` độ rồi gắn vào cảnh — và ĐO VẬT CẢN
 * của nó: mỗi con trực tiếp một hộp (không gộp cả nhóm: bàn họp + người ngồi
 * gộp một hộp thì phủ luôn cái ghế trống mà `actor.sit` cần tới). Bỏ qua: bóng
 * tiếp xúc, đồ phẳng sát sàn, và mọi nhánh khai `userData.khongChan` (ghế trống,
 * sofa — chỗ ngồi phải đi tới được).
 */
function datNhom(b: Bo, g: THREE.Group, x: number, z: number, quay: number): THREE.Group {
  g.position.set(x, 0, z);
  g.rotation.y = THREE.MathUtils.degToRad(quay);
  b.nhom.add(g);
  if (g.userData.khongChan) return g;
  g.updateMatrixWorld(true);
  const hopCon = new THREE.Box3();
  for (const con of g.children) {
    if (con.userData.khongChan) continue;
    hopCon.makeEmpty();
    con.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.material === b.bong) return;
      let p: THREE.Object3D | null = o;
      while (p && p !== con) {
        if (p.userData.khongChan) return;
        p = p.parent;
      }
      hopCon.expandByObject(m);
    });
    if (hopCon.isEmpty() || hopCon.max.y < 0.06) continue;
    b.vatCan.push({ id: `${g.name || 'do'}-${b.vatCan.length}`, x0: hopCon.min.x, x1: hopCon.max.x, z0: hopCon.min.z, z1: hopCon.max.z });
  }
  return g;
}

/* ------------------------------------------------------------- đồ nội thất */

const MAU_GO = 0xc79a6b;
const MAU_GO_DAM = 0x8a5f3c;
const MAU_TRANG = 0xf4f0e8;
const MAU_KIM = 0x3a3d45;

let manHinhVl: THREE.MeshStandardMaterial[] | null = null;
function vlManHinh(i: number): THREE.MeshStandardMaterial {
  manHinhVl ??= [0, 1, 2].map((k) => {
    const t = vanManHinh(k);
    return new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.3 });
  });
  return manHinhVl[i % 3]!;
}

/** Ghế văn phòng: đệm + lưng bo tròn, trụ + chân sao. Gốc (0,0,0), mặt ghế hướng +Z. */
function ghe(mau: number): THREE.Group {
  const g = new THREE.Group();
  g.userData.khongChan = true;
  hop(g, 0.38, 0.07, 0.36, vl(mau, 0.8), 0, CAO_GHE, 0, 0.03);
  hop(g, 0.38, 0.36, 0.07, vl(mau, 0.8), 0, CAO_GHE + 0.2, -0.18, 0.03);
  tru(g, 0.025, 0.025, CAO_GHE - 0.06, vl(MAU_KIM, 0.4), 0, (CAO_GHE - 0.06) / 2 + 0.03, 0, false);
  tru(g, 0.17, 0.17, 0.03, vl(MAU_KIM, 0.4), 0, 0.03, 0, false);
  return g;
}

let soBan = 0;
/**
 * Một chỗ làm việc: bàn + màn hình + bàn phím + ghế (+ đồ lặt vặt). Bàn ở z=0,
 * ghế ở z=−0,5 nhìn về +Z. `nguoi` = một búp bê ngồi làm việc ở ghế.
 */
function choLamViec(
  b: Bo,
  x: number,
  z: number,
  quay: number,
  mauGhe: number,
  nguoi: number | null,
  coManHinh = true,
  gheZ = -0.48,
): void {
  const g = new THREE.Group();
  soBan += 1;
  // mặt bàn + 2 chân tấm
  hop(g, 1.1, 0.05, 0.6, vl(MAU_GO, 0.6), 0, CAO_BAN, 0.05, 0.02);
  for (const dau of [1, -1]) hop(g, 0.05, CAO_BAN - 0.03, 0.52, vl(MAU_TRANG, 0.6), dau * 0.5, (CAO_BAN - 0.03) / 2, 0.05, 0.015);
  // màn hình (bàn của Nhi thì KHÔNG: màn hình thật `may-tinh` của sân khấu đứng ở đó)
  if (coManHinh) {
    hop(g, 0.5, 0.31, 0.035, vl(0x2a2d34, 0.4), 0, CAO_BAN + 0.27, 0.22, 0.015);
    const mh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.27), vlManHinh(soBan));
    mh.position.set(0, CAO_BAN + 0.27, 0.2);
    mh.rotation.y = Math.PI;
    g.add(mh);
    tru(g, 0.015, 0.015, 0.12, vl(0x2a2d34, 0.4), 0, CAO_BAN + 0.08, 0.25, false);
    hop(g, 0.14, 0.012, 0.1, vl(0x2a2d34, 0.4), 0, CAO_BAN + 0.03, 0.25, 0.005, false);
  }
  // bàn phím + chuột
  hop(g, 0.32, 0.015, 0.1, vl(0xe9e6e0, 0.5), 0, CAO_BAN + 0.033, -0.05, 0.006, false);
  hop(g, 0.04, 0.02, 0.06, vl(0xe9e6e0, 0.5), 0.24, CAO_BAN + 0.035, -0.05, 0.01, false);
  // đồ lặt vặt xen kẽ: cốc / cây nhỏ / chồng giấy
  const k = soBan % 3;
  if (k === 0) tru(g, 0.035, 0.03, 0.08, vl(0xe37b5a, 0.4), -0.38, CAO_BAN + 0.065, 0.05, false);
  else if (k === 1) {
    tru(g, 0.05, 0.04, 0.08, vl(0xd9cbb3, 0.6), -0.4, CAO_BAN + 0.065, 0.15, false);
    const la = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 1), vl(0x5c9a52, 0.8, { flatShading: true }));
    la.position.set(-0.4, CAO_BAN + 0.16, 0.15);
    g.add(la);
  } else hop(g, 0.2, 0.04, 0.14, vl(0xfbfaf6, 0.7), -0.33, CAO_BAN + 0.045, 0.02, 0.005, false);
  // ghế
  const gh = ghe(mauGhe);
  gh.position.z = gheZ;
  g.add(gh);
  if (nguoi !== null) {
    const bb = new BupBe(NHAN_VIEN[nguoi % NHAN_VIEN.length]!);
    bb.tuThe('ngoi');
    bb.goc.position.set(0, CAO_GHE + 0.04, -0.46);
    bb.goc.rotation.y = 0;
    g.add(bb.goc);
  }
  bongDat(b, g, 0, -0.15, 0.75, 0.6);
  datNhom(b, g, x, z, quay);
}

/** Chậu cây lớn: chậu bo tròn + tán lá nhiều khối. */
function cayChau(b: Bo, x: number, z: number, cao = 1.0, mauChau = 0xe8e1d4): void {
  const g = new THREE.Group();
  tru(g, 0.2, 0.15, 0.32, vl(mauChau, 0.5), 0, 0.16, 0);
  let s = Math.floor((x * 31 + z * 17) * 100) >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
  const la = vl(0x4f8a46, 0.8, { flatShading: true });
  const la2 = vl(0x6aa85a, 0.8, { flatShading: true });
  for (let i = 0; i < 7; i += 1) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + r() * 0.12, 1), i % 2 ? la : la2);
    const a = r() * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.14, 0.4 + (i / 7) * (cao - 0.4) + r() * 0.1, Math.sin(a) * 0.14);
    m.castShadow = true;
    g.add(m);
  }
  bongDat(b, g, 0, 0, 0.42, 0.42);
  datNhom(b, g, x, z, 0);
}

/** Kệ thấp ngăn mềm giữa hai khu: hộp gỗ + sách/bìa hồ sơ nhiều màu. */
function keThap(b: Bo, x: number, z: number, dai: number, quay: number): void {
  const g = new THREE.Group();
  hop(g, dai, 0.7, 0.36, vl(MAU_GO, 0.6), 0, 0.35, 0, 0.03);
  const mau = [0xd9534f, 0x3f7cc0, 0xf0ad4e, 0x5cb85c, 0x8e6bbf, 0xf4f0e8];
  const n = Math.floor(dai / 0.08);
  for (let i = 0; i < n; i += 1) {
    if (i % 7 === 6) continue;
    const h = 0.18 + ((i * 13) % 7) * 0.012;
    hop(g, 0.06, h, 0.24, vl(mau[(i * 5) % mau.length]!, 0.7), -dai / 2 + 0.08 + i * 0.08, 0.72 + h / 2 - 0.02, 0, 0.01, false);
  }
  bongDat(b, g, 0, 0, dai / 2 + 0.2, 0.35);
  datNhom(b, g, x, z, quay);
}

/** Biển tên phòng ban đứng (hai mặt) — thứ làm khu "rõ ràng" khi không có vách. */
function bienTen(b: Bo, ten: string, mau: number, x: number, z: number, quay: number): void {
  const g = new THREE.Group();
  tru(g, 0.03, 0.03, 1.5, vl(MAU_KIM, 0.4), 0, 0.75, 0);
  tru(g, 0.16, 0.18, 0.04, vl(MAU_KIM, 0.4), 0, 0.02, 0, false);
  hop(g, 1.2, 0.4, 0.05, vl(0xfbf6ec, 0.6), 0, 1.62, 0, 0.03);
  const tex = vanBien(ten, mau);
  const m = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25, roughness: 0.6 });
  for (const dau of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 0.356), m);
    p.position.set(0, 1.62, dau * 0.027);
    if (dau < 0) p.rotation.y = Math.PI;
    g.add(p);
  }
  bongDat(b, g, 0, 0, 0.3, 0.3);
  datNhom(b, g, x, z, quay);
}

/** Đèn sàn ấm (chụp vải) — một vũng sáng trên sàn. */
function denSan(b: Bo, x: number, z: number): void {
  const g = new THREE.Group();
  tru(g, 0.02, 0.02, 1.35, vl(MAU_KIM, 0.4), 0, 0.68, 0);
  tru(g, 0.15, 0.15, 0.03, vl(MAU_KIM, 0.4), 0, 0.015, 0, false);
  const chup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.26, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc070, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
  chup.position.y = 1.42;
  g.add(chup);
  datNhom(b, g, x, z, 0);
  b.den.push(new THREE.Vector3(x, 1.4, z));
}

/* ---------------------------------------------------------------- các khu */

function thamKhu(b: Bo, k: (typeof KHU_VP)[number]): void {
  const w = k.x1 - k.x0;
  const d = k.z1 - k.z0;
  const tex = vanTham(k.mau);
  tex.repeat.set(w / 2, d / 2);
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, 0.03, d, 2, 0.012), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.position.set((k.x0 + k.x1) / 2, 0.015, (k.z0 + k.z1) / 2);
  m.receiveShadow = true;
  b.nhom.add(m);
}

function khuKyThuat(b: Bo): void {
  let n = 0;
  for (const x of [-10.0, -7.5, -5.0]) {
    for (const z of [-6.6, -3.4]) {
      choLamViec(b, x, z - 0.55, 0, 0x4a5b7a, n === 4 ? null : n);
      n += 1;
      choLamViec(b, x, z + 0.55, 180, 0x4a5b7a, n === 7 ? null : n);
      n += 1;
    }
  }
  bienTen(b, 'Kỹ thuật', KHU_VP[0].mau, -3.9, -1.9, 0);
}

function khuThietKe(b: Bo): void {
  // hai bàn lớn kiểu xưởng, mỗi bàn 2 người + bảng ý tưởng
  for (const [x, z] of [
    [-9.4, 3.0],
    [-6.0, 3.0],
  ] as const) {
    const g = new THREE.Group();
    hop(g, 2.2, 0.06, 1.1, vl(0xf2ece2, 0.5), 0, CAO_BAN, 0, 0.03);
    for (const [dx, dz] of [
      [-1, -0.45],
      [1, -0.45],
      [-1, 0.45],
      [1, 0.45],
    ] as const)
      tru(g, 0.025, 0.025, CAO_BAN, vl(MAU_GO_DAM, 0.5), dx * 0.98, CAO_BAN / 2, dz, false);
    // giấy vẽ màu, bảng màu
    const mau = [0xe8a87c, 0x85c1e9, 0xf7dc6f, 0xa9dfbf];
    for (let i = 0; i < 4; i += 1) hop(g, 0.36, 0.006, 0.26, vl(mau[i]!, 0.8), -0.75 + i * 0.5, CAO_BAN + 0.034, (i % 2) * 0.2 - 0.1, 0.002, false);
    for (const dz of [-0.85, 0.85]) {
      const gh = ghe(0xc0704e);
      gh.position.set(dz < 0 ? -0.5 : 0.5, 0, dz);
      gh.rotation.y = dz < 0 ? 0 : Math.PI;
      g.add(gh);
      const bb = new BupBe(NHAN_VIEN[(x < -8 ? 1 : 3) + (dz < 0 ? 0 : 2)]!);
      bb.tuThe('ngoi');
      bb.goc.position.set(dz < 0 ? -0.5 : 0.5, CAO_GHE + 0.04, dz * 0.97);
      bb.goc.rotation.y = dz < 0 ? 0 : Math.PI;
      g.add(bb.goc);
    }
    bongDat(b, g, 0, 0, 1.5, 1.1);
    datNhom(b, g, x, z, 0);
  }
  // bảng ý tưởng (moodboard) đứng
  const g = new THREE.Group();
  hop(g, 1.8, 1.1, 0.06, vl(0xfaf7f0, 0.7), 0, 1.05, 0, 0.03);
  for (const dau of [1, -1]) hop(g, 0.05, 1.5, 0.05, vl(MAU_GO_DAM, 0.5), dau * 0.88, 0.75, 0, 0.015);
  const mau = [0xe8a87c, 0x85c1e9, 0xf7dc6f, 0xa9dfbf, 0xd7bde2, 0xf5b7b1];
  for (let i = 0; i < 9; i += 1) hop(g, 0.36, 0.26, 0.012, vl(mau[i % mau.length]!, 0.8), -0.55 + (i % 3) * 0.55, 1.35 - Math.floor(i / 3) * 0.32, 0.04, 0.004, false);
  bongDat(b, g, 0, 0, 1.0, 0.3);
  datNhom(b, g, -7.7, 6.3, 180);
  const dung = new BupBe(NHAN_VIEN[6]!);
  dung.tuThe('dung-noi');
  datNhom(b, dung.goc, -7.7, 5.5, 180);
  bienTen(b, 'Thiết kế', KHU_VP[1].mau, -3.9, 1.0, 0);
}

function khuKinhDoanh(b: Bo): void {
  let n = 2;
  for (const x of [6.0, 8.4, 10.6]) {
    choLamViec(b, x, -7.3, 0, 0x5f7a54, n);
    n += 1;
    choLamViec(b, x, -4.6, 180, 0x5f7a54, n % 3 === 0 ? null : n);
    n += 1;
  }
  bienTen(b, 'Kinh doanh', KHU_VP[2].mau, 4.9, -3.1, 0);
}

function khuPhongHop(b: Bo): void {
  const g = new THREE.Group();
  hop(g, 3.4, 0.07, 1.3, vl(MAU_GO_DAM, 0.45), 0, CAO_BAN, 0, 0.04);
  for (const dx of [-1.2, 1.2]) hop(g, 0.12, CAO_BAN - 0.04, 0.9, vl(0x2f3138, 0.4), dx, (CAO_BAN - 0.04) / 2, 0, 0.02);
  // 8 ghế quanh bàn, 5 người họp
  let n = 0;
  for (const dx of [-1.15, -0.4, 0.4, 1.15]) {
    for (const dau of [1, -1]) {
      const gh = ghe(0x8f8478);
      gh.position.set(dx, 0, dau * 0.95);
      gh.rotation.y = dau > 0 ? Math.PI : 0;
      g.add(gh);
      if (n % 3 !== 1) {
        const bb = new BupBe(NHAN_VIEN[(n + 4) % NHAN_VIEN.length]!);
        bb.tuThe('ngoi');
        bb.goc.position.set(dx, CAO_GHE + 0.04, dau * 0.93);
        bb.goc.rotation.y = dau > 0 ? Math.PI : 0;
        g.add(bb.goc);
      }
      n += 1;
    }
  }
  // giấy + laptop trên bàn
  for (let i = 0; i < 4; i += 1) hop(g, 0.22, 0.006, 0.3, vl(0xfbfaf6, 0.7), -1.2 + i * 0.8, CAO_BAN + 0.04, 0.3 * (i % 2 ? 1 : -1), 0.002, false);
  // màn trình chiếu đứng ở đầu bàn
  hop(g, 0.08, 1.0, 0.08, vl(0x2f3138, 0.4), 2.35, 0.5, 0, 0.02);
  // khung màn trình chiếu — tấm màn THẬT là `tivi` của sân khấu (`MAC_DINH_MAN_HINH`)
  hop(g, 0.08, 0.95, 1.6, vl(0x2a2d34, 0.4), 2.4, 1.35, 0, 0.02);
  const tr = new BupBe(NHAN_VIEN[7]!);
  tr.tuThe('dung-noi');
  tr.goc.position.set(1.95, 0, 0.75);
  tr.goc.rotation.y = -Math.PI / 2 - 0.4;
  g.add(tr.goc);
  bongDat(b, g, 0, 0, 2.2, 1.4);
  datNhom(b, g, 7.6, 0.3, 0);
  bienTen(b, 'Phòng họp', KHU_VP[3].mau, 4.9, 2.9, 0);
}

function khuPantry(b: Bo): void {
  // quầy + máy cà phê + tủ lạnh dọc mép đông
  const g = new THREE.Group();
  hop(g, 0.7, 0.9, 3.0, vl(MAU_TRANG, 0.5), 0, 0.45, 0, 0.04);
  hop(g, 0.76, 0.05, 3.06, vl(MAU_GO, 0.5), 0, 0.92, 0, 0.02);
  hop(g, 0.32, 0.36, 0.3, vl(0x2f3138, 0.35), 0, 1.13, -0.8, 0.04);
  tru(g, 0.05, 0.045, 0.1, vl(MAU_TRANG, 0.35), 0, 1.0, -0.6, false);
  hop(g, 0.7, 1.7, 0.7, vl(0xd8dde2, 0.35), 0, 0.85, 1.85, 0.06);
  for (let i = 0; i < 4; i += 1) tru(g, 0.04, 0.035, 0.09, vl([0xe37b5a, 0x6aa8d8, 0xf0c35a, 0x8fc98a][i]!, 0.4), 0, 0.99, -0.1 + i * 0.22, false);
  bongDat(b, g, 0, 0.3, 0.6, 2.2);
  datNhom(b, g, 11.0, 5.4, 0);
  // 2 bàn tròn + ghế đẩu
  for (const [x, z] of [
    [6.2, 5.4],
    [8.6, 5.8],
  ] as const) {
    const t = new THREE.Group();
    tru(t, 0.45, 0.45, 0.05, vl(MAU_GO, 0.5), 0, CAO_BAN, 0);
    tru(t, 0.04, 0.04, CAO_BAN, vl(MAU_KIM, 0.4), 0, CAO_BAN / 2, 0, false);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      tru(t, 0.16, 0.16, 0.06, vl(0xf0c35a, 0.6), Math.cos(a) * 0.7, CAO_GHE, Math.sin(a) * 0.7);
      tru(t, 0.025, 0.025, CAO_GHE, vl(MAU_KIM, 0.4), Math.cos(a) * 0.7, CAO_GHE / 2, Math.sin(a) * 0.7, false);
    }
    tru(t, 0.035, 0.03, 0.08, vl(0xe37b5a, 0.4), 0.1, CAO_BAN + 0.065, 0.05, false);
    bongDat(b, t, 0, 0, 0.9, 0.9);
    datNhom(b, t, x, z, 0);
  }
  const c1 = new BupBe(NHAN_VIEN[2]!);
  c1.tuThe('bung-coc');
  datNhom(b, c1.goc, 10.2, 6.4, -90);
  const c2 = new BupBe(NHAN_VIEN[5]!);
  c2.tuThe('bung-coc');
  datNhom(b, c2.goc, 9.9, 7.0, 200);
  bienTen(b, 'Pantry', KHU_VP[4].mau, 4.9, 4.3, 0);
}

function khuLeTan(b: Bo): void {
  const g = new THREE.Group();
  hop(g, 2.6, 0.8, 0.6, vl(0xf4ede0, 0.5), 0, 0.4, 0, 0.06);
  hop(g, 2.7, 0.05, 0.7, vl(MAU_GO, 0.45), 0, 0.82, 0, 0.02);
  // logo trên mặt quầy
  const tex = vanLogo();
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 }));
  logo.position.set(0, 0.42, 0.302);
  g.add(logo);
  hop(g, 0.4, 0.26, 0.03, vl(0x2a2d34, 0.4), 0.6, 0.98, -0.12, 0.012);
  const gh = ghe(0x46557c);
  gh.position.set(0, 0, -0.75);
  g.add(gh);
  const bb = new BupBe(NHAN_VIEN[1]!);
  datNhom(b, bb.goc, 0.2, 5.2, 0);
  bongDat(b, g, 0, 0, 1.6, 0.6);
  datNhom(b, g, 0.2, 6.2, 0);
  cayChau(b, -1.9, 6.9, 1.2);
  cayChau(b, 2.3, 6.9, 1.0, 0x46557c);
}

function khuNghi(b: Bo): void {
  const g = new THREE.Group();
  const mauSofa = 0x8e7bb0;
  hop(g, 2.0, 0.26, 0.7, vl(mauSofa, 0.85), 0, 0.2, 0, 0.1);
  hop(g, 2.0, 0.42, 0.18, vl(mauSofa, 0.85), 0, 0.42, -0.3, 0.08);
  for (const dau of [1, -1]) hop(g, 0.18, 0.36, 0.7, vl(mauSofa, 0.85), dau * 0.95, 0.3, 0, 0.08);
  hop(g, 0.3, 0.28, 0.1, vl(0xf5d6a0, 0.9), -0.5, 0.44, -0.18, 0.05);
  hop(g, 0.3, 0.28, 0.1, vl(0xa9d3c4, 0.9), 0.55, 0.44, -0.18, 0.05);
  tru(g, 0.45, 0.45, 0.05, vl(MAU_GO, 0.5), -0.3, 0.3, 1.2);
  tru(g, 0.3, 0.3, 0.28, vl(MAU_GO_DAM, 0.5), -0.3, 0.14, 1.2, false);
  hop(g, 0.25, 0.04, 0.18, vl(0xe8a87c, 0.7), -0.4, 0.345, 1.15, 0.01, false);
  tru(g, 0.035, 0.03, 0.08, vl(MAU_TRANG, 0.4), -0.12, 0.37, 1.25, false);
  const ngoi = new BupBe(NHAN_VIEN[0]!);
  ngoi.tuThe('ngoi');
  ngoi.goc.position.set(-0.4, 0.33, 0.05);
  g.add(ngoi.goc);
  bongDat(b, g, 0, 0.4, 1.3, 1.0);
  // chỗ ngồi sofa phải đi tới được (place `sofa`) → không đo tự động; khai tay
  // lưng tựa + tay vịn + bàn tròn + người đang ngồi
  g.userData.khongChan = true;
  // INT-07: dời xuống giữa sàn (chỗ tường bắc nhường cho Ban giám đốc) — lệch +3,4 m theo z
  datNhom(b, g, 0.4, -3.9, 0);
  b.vatCan.push(
    // tay vịn thấp, không khai: hộp của nó (nở 0,34 m) nuốt mất chỗ ngồi sofa
    { id: 'sofa-lung', x0: -0.65, x1: 1.45, z0: -4.35, z1: -4.05 },
    { id: 'sofa-ban', x0: -0.35, x1: 0.55, z0: -3.15, z1: -2.25 },
    { id: 'sofa-nguoi', x0: -0.25, x1: 0.25, z0: -4.05, z1: -3.6 },
  );
  denSan(b, -1.8, -4.6);
  cayChau(b, 2.9, -4.7, 1.2);
  bienTen(b, 'Khu nghỉ', KHU_VP[6].mau, -2.1, -2.2, 0);
}

/**
 * INT-07 — dãy tủ hồ sơ thấp ÁP TƯỜNG BẮC sau lưng hai ghế lãnh đạo: thứ cho
 * lưng "có chỗ tựa". Không chặn đường (`khongChan`): nó nằm trọn trong lề tường
 * 0,5 m mà không ai đi vào được.
 */
function tuLungLanhDao(b: Bo): void {
  const g = new THREE.Group();
  g.userData.khongChan = true;
  const DAI = 3.9;
  const SAU = 0.42;
  const CAO = 0.55;
  hop(g, DAI, CAO, SAU, vl(MAU_GO_DAM, 0.5), 0, CAO / 2, 0, 0.03);
  hop(g, DAI + 0.04, 0.04, SAU + 0.03, vl(MAU_GO, 0.45), 0, CAO + 0.02, 0, 0.01);
  // cánh tủ + tay nắm
  for (let i = 0; i < 6; i += 1) {
    const x = -DAI / 2 + DAI / 12 + (i * DAI) / 6;
    hop(g, DAI / 6 - 0.04, CAO - 0.1, 0.012, vl(0x5c4433, 0.55), x, CAO / 2, SAU / 2 + 0.006, 0.005, false);
    hop(g, 0.08, 0.015, 0.02, vl(MAU_KIM, 0.3), x, CAO - 0.12, SAU / 2 + 0.016, 0.005, false);
  }
  // đồ trên nóc tủ: sách, cúp, chậu nhỏ
  const mauSach = [0xc0563f, 0x3f6fa8, 0xd9a441, 0x5f7a54, 0x8e7bb0];
  for (let i = 0; i < 5; i += 1) hop(g, 0.05, 0.22, 0.16, vl(mauSach[i]!, 0.7), -1.55 + i * 0.06, CAO + 0.15, 0, 0.005, false);
  tru(g, 0.05, 0.035, 0.1, vl(0xd8b04a, 0.25), 1.2, CAO + 0.09, 0, false);
  tru(g, 0.07, 0.05, 0.12, vl(0xd8b04a, 0.25), 1.2, CAO + 0.2, 0, false);
  tru(g, 0.06, 0.05, 0.1, vl(0xe8e1d4, 0.6), 0.2, CAO + 0.09, 0, false);
  const la = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), vl(0x5c9a52, 0.8, { flatShading: true }));
  la.position.set(0.2, CAO + 0.22, 0);
  g.add(la);
  bongDat(b, g, 0, 0, DAI / 2 + 0.1, 0.35);
  datNhom(b, g, (X_BAN_CEO + X_BAN_NHI) / 2 + 0.1, SAN_VP.z0 + SAU / 2 + 0.01, 0);
}

/**
 * INT-07 — chỗ làm của CEO: bàn gỗ đậm 1,5 m + màn hình + bảng tên "CEO", ghế
 * bành tối (`khongChan` — place `ghe-ceo` phải ngồi được), thảm xanh đậm làm
 * "phòng riêng không vách". Lưng tựa tường bắc (dãy tủ `tuLungLanhDao`). Toạ độ
 * khớp place `ban-ceo`/`ghe-ceo` trong `noi-dung.ts`.
 */
function banCeo(b: Bo): void {
  const X = X_BAN_CEO;
  const Z = Z_BAN_LANH_DAO;
  // thảm riêng (dưới cùng, không chặn đường)
  const tham = new THREE.Mesh(
    new RoundedBoxGeometry(2.2, 0.02, 1.6, 2, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x34405e, roughness: 1 }),
  );
  tham.position.set(X, 0.04, Z - 0.2); // nằm TRÊN thảm khu (mặt 0,03)
  tham.receiveShadow = true;
  b.nhom.add(tham);
  const g = new THREE.Group();
  hop(g, 1.5, 0.06, 0.72, vl(MAU_GO_DAM, 0.45), 0, CAO_BAN, 0.05, 0.02);
  hop(g, 1.44, CAO_BAN - 0.04, 0.06, vl(MAU_GO_DAM, 0.5), 0, (CAO_BAN - 0.04) / 2, 0.36, 0.015);
  for (const dau of [1, -1]) hop(g, 0.06, CAO_BAN - 0.04, 0.66, vl(MAU_GO_DAM, 0.5), dau * 0.71, (CAO_BAN - 0.04) / 2, 0.05, 0.015);
  // màn hình + bàn phím + bảng tên
  hop(g, 0.56, 0.33, 0.035, vl(0x2a2d34, 0.4), 0.15, CAO_BAN + 0.29, 0.25, 0.015);
  const mh = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.29), vlManHinh(1));
  mh.position.set(0.15, CAO_BAN + 0.29, 0.23);
  mh.rotation.y = Math.PI;
  g.add(mh);
  tru(g, 0.015, 0.015, 0.12, vl(0x2a2d34, 0.4), 0.15, CAO_BAN + 0.08, 0.28, false);
  hop(g, 0.32, 0.015, 0.1, vl(0xe9e6e0, 0.5), 0.15, CAO_BAN + 0.038, -0.05, 0.006, false);
  const bt = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.1),
    new THREE.MeshStandardMaterial({ map: vanBien('CEO', 0x34405e), roughness: 0.6 }),
  );
  bt.position.set(-0.45, CAO_BAN + 0.09, -0.27);
  bt.rotation.set(-0.35, Math.PI, 0);
  g.add(bt);
  hop(g, 0.36, 0.1, 0.06, vl(0xd8c08a, 0.4), -0.45, CAO_BAN + 0.06, -0.24, 0.01, false);
  // ghế bành: rộng + lưng cao, tối màu
  const gh = new THREE.Group();
  gh.userData.khongChan = true;
  hop(gh, 0.5, 0.09, 0.46, vl(0x2b2f3a, 0.7), 0, CAO_GHE, 0, 0.04);
  hop(gh, 0.5, 0.56, 0.09, vl(0x2b2f3a, 0.7), 0, CAO_GHE + 0.3, -0.22, 0.04);
  for (const dau of [1, -1]) hop(gh, 0.07, 0.16, 0.4, vl(0x2b2f3a, 0.7), dau * 0.26, CAO_GHE + 0.12, 0, 0.03);
  tru(gh, 0.03, 0.03, CAO_GHE - 0.06, vl(MAU_KIM, 0.4), 0, (CAO_GHE - 0.06) / 2 + 0.03, 0, false);
  tru(gh, 0.2, 0.2, 0.03, vl(MAU_KIM, 0.4), 0, 0.03, 0, false);
  gh.position.z = GHE_LANH_DAO;
  g.add(gh);
  bongDat(b, g, 0, -0.15, 0.95, 0.7);
  // quay 0: ghế phía tường (−Z), CEO nhìn +Z ra cả văn phòng
  datNhom(b, g, X, Z, 0);
  cayChau(b, X + 2.5, -8.45, 1.1, 0x34405e);
}

/* ---------------------------------------------------------------- vỏ toà nhà */

function voToaNha(b: Bo): void {
  const { x0, x1, z0, z1 } = SAN_VP;
  const W = x1 - x0;
  const D = z1 - z0;
  // ĐẾ diorama dày (mép gỗ đậm) — thứ làm cảnh trông như "mô hình đặt trên bàn"
  hop(b.nhom, W + 0.6, 0.5, D + 0.6, vl(0x5b4636, 0.6), (x0 + x1) / 2, -0.25, (z0 + z1) / 2, 0.08, false);
  // sàn gỗ
  const san = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: vanSanGo(), roughness: 0.75 }));
  san.rotation.x = -Math.PI / 2;
  san.position.set((x0 + x1) / 2, 0.001, (z0 + z1) / 2);
  san.receiveShadow = true;
  b.nhom.add(san);
  // tường sau (bắc) + tường tây, cắt thấp, có cửa sổ sáng
  const vlTuong = vl(0xf1e7d6, 0.9);
  const vlChan = vl(MAU_GO_DAM, 0.6);
  hop(b.nhom, W, CAO_TUONG, 0.24, vlTuong, (x0 + x1) / 2, CAO_TUONG / 2, z0 - 0.12, 0.02);
  hop(b.nhom, 0.24, CAO_TUONG, D, vlTuong, x0 - 0.12, CAO_TUONG / 2, (z0 + z1) / 2, 0.02);
  hop(b.nhom, W, 0.12, 0.27, vlChan, (x0 + x1) / 2, 0.06, z0 - 0.12, 0.01);
  hop(b.nhom, 0.27, 0.12, D, vlChan, x0 - 0.12, 0.06, (z0 + z1) / 2, 0.01);
  // nẹp đỉnh tường
  hop(b.nhom, W + 0.24, 0.06, 0.32, vlChan, (x0 + x1) / 2, CAO_TUONG, z0 - 0.12, 0.01);
  hop(b.nhom, 0.32, 0.06, D, vlChan, x0 - 0.12, CAO_TUONG, (z0 + z1) / 2, 0.01);
  const tex = vanCuaSo();
  const vlCs = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.75, roughness: 0.3 });
  for (let x = x0 + 1.6; x < x1 - 1; x += 2.6) {
    if (Math.abs(x) < 2.2) continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.4), vlCs);
    m.position.set(x, 1.25, z0 + 0.005);
    b.nhom.add(m);
  }
  for (let z = z0 + 1.6; z < z1 - 0.8; z += 2.6) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.4), vlCs);
    m.position.set(x0 + 0.005, 1.25, z);
    m.rotation.y = Math.PI / 2;
    b.nhom.add(m);
  }
  // logo GEN LABS giữa tường sau
  const lt = vanLogo();
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.94), new THREE.MeshStandardMaterial({ map: lt, emissive: 0xffffff, emissiveMap: lt, emissiveIntensity: 0.2 }));
  logo.position.set(0.5, 1.55, z0 + 0.01);
  b.nhom.add(logo);
}

/* ---------------------------------------------------------------- dựng */

export async function dungVanPhong(scene: THREE.Scene): Promise<Canh> {
  const nhom = new THREE.Group();
  nhom.name = 'van-phong';
  const b: Bo = {
    nhom,
    vatCan: [],
    den: [],
    chan: [],
    bong: new THREE.MeshBasicMaterial({ map: vanBongDat(), transparent: true, opacity: 0.5, depthWrite: false, color: 0x000000 }),
  };
  soBan = 0;
  voToaNha(b);
  for (const k of KHU_VP) thamKhu(b, k);
  khuKyThuat(b);
  khuThietKe(b);
  khuKinhDoanh(b);
  khuPhongHop(b);
  khuPantry(b);
  khuLeTan(b);
  khuNghi(b);
  // INT-07 — BAN GIÁM ĐỐC dọc tường bắc, LƯNG TỰA TƯỜNG (Ryan 27/10), mặt nhìn ra văn phòng:
  // bàn Giám đốc kỹ thuật Nhi (place `ban-dieu-khien`/`ghe-2`, màn hình `may-tinh`) + bàn CEO
  // Nam dưới logo (to hơn, ghế bành, thảm riêng) + dãy tủ hồ sơ áp tường sau lưng cả hai.
  choLamViec(b, X_BAN_NHI, Z_BAN_LANH_DAO, 0, 0xe0607e, null, false, GHE_LANH_DAO);
  banCeo(b);
  tuLungLanhDao(b);
  bienTen(b, 'Ban giám đốc', KHU_VP[7].mau, 3.1, -6.6, 0);

  // ngăn mềm giữa các khu: kệ thấp + cây (KHÔNG vách)
  keThap(b, -7.5, -0.4, 4.6, 0);
  // kệ ngắn hơn mép khu: mỗi khu phải có LỐI VÀO ≥ 1 m (đo thật: Pantry từng khép kín, A* không ra được)
  keThap(b, 7.6, -2.7, 2.4, 0);
  keThap(b, 7.4, 3.3, 2.4, 0);
  for (const [x, z, h] of [
    [-11.2, -0.4, 1.3],
    [-3.9, -0.4, 1.0],
    [4.9, -2.7, 1.1],
    [11.2, -2.7, 1.2],
    [4.9, 3.3, 1.0],
    [-11.3, -8.5, 1.4],
    [-11.3, 6.9, 1.2],
    [11.3, -8.5, 1.3],
    [-3.0, 3.6, 0.9],
  ] as const)
    cayChau(b, x, z, h);
  for (const [x, z] of [
    [-3.4, -8.2],
    [4.3, -8.2],
    [-11.4, 3.7],
  ] as const)
    denSan(b, x, z);

  // vũng sáng ấm dưới đèn sàn
  const vlVung = new THREE.MeshBasicMaterial({ map: vanVung(), color: 0xffb36a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const p of b.den) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), vlVung);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.035, p.z);
    m.renderOrder = 2;
    m.userData.khongGop = true;
    nhom.add(m);
  }

  scene.add(nhom);
  nhom.updateMatrixWorld(true);
  let truoc = 0;
  nhom.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) truoc += 1;
  });
  const gopKq = gopTinh(nhom);
  const hopKhoi = new Map<string, { min: [number, number, number]; max: [number, number, number] }>();
  for (const c of b.chan) hopKhoi.set(c.id, { min: c.min, max: c.max });
  return {
    nhom,
    gop: { truoc, sau: gopKq.sau },
    noc: new Map([['ban-nhi', CAO_BAN + 0.025]]),
    day: new Map(),
    matNgoi: new Map(),
    hopKhoi,
    denLong: b.den,
    vatCan: b.vatCan,
    khungSan: { ...SAN_VP },
  };
}
