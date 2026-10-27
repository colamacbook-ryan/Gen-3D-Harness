/**
 * BẢN THỬ "LÀNG HANOK" (Ryan 27/10: đổi phong cách 3D theo ảnh diorama làng Hàn).
 *
 * Bật bằng `?canh=lang`. Căn nhà D1b/J1 không bị động tới — đây là một CẢNH KHÁC
 * cùng chạy trên `World` (nhân vật, lệnh, bridge y hệt), để Ryan so tận mắt.
 *
 * Mọi thứ dựng bằng hình học thủ tục, KHÔNG tải asset: kiểm license 27/10 không
 * có bộ hanok/giwa nào CC0 dùng được (mái ngói cong, đèn lồng giấy, tường đá mũ
 * ngói, lu sành đều phải tự dựng). Cây/rau cũng tự dựng cho đồng một tông —
 * trộn Kenney + Quaternius + Sketchfab là lệch màu, lệch tỉ lệ.
 *
 * Ngân sách (L-42, Boss "đừng đòi GPU lớn"): rau/hoa/cỏ là `InstancedMesh`,
 * phần tĩnh còn lại gộp theo vật liệu bằng `gopTinh()`; đèn lồng là vật liệu
 * tự sáng + quầng sprite cộng màu — chỉ 4 đèn điểm thật, không đổ bóng.
 */
import * as THREE from 'three';
import { gopTinh, type Phong } from './phong';

/* ------------------------------------------------------------------ bảng màu */

const MAU = {
  ngoi: 0x3b414d,
  ngoiNoc: 0x2a2e36,
  go: 0x6e4428,
  goSang: 0x9a6a40,
  tuong: 0xeadcc2,
  da: 0x9a9690,
  dat: 0xcdb48e,
  datRau: 0x5a3b26,
  la: 0x4f8a3a,
  laSang: 0x7fb34a,
  khoai: 0x8a2e4f,
  cu: 0xd9b98a,
  ongGi: 0x5a3420,
  anhDao: [0xf4b3cf, 0xe993bd, 0xf7c7dc],
  hoa: [0xd94f93, 0xb27ad9, 0xf09cc4, 0xe86aa8],
  co: 0x58803c,
  den: 0xffc66e,
} as const;

/* --------------------------------------------------------------- texture vẽ */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement, lap = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (lap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Số giả ngẫu nhiên có hạt — cảnh dựng ra lần nào cũng y hệt (ảnh so được). */
function taoNgauNhien(hat: number): () => number {
  let s = hat >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Ngói âm dương: từng hàng ngói tròn chạy DỌC mái (cột = một hàng ngói). */
function vanNgoi(): THREE.CanvasTexture {
  // hàng ngói TRÒN nổi khối, xám-xanh, sống ngói sáng (ảnh mẫu) — một ô = một hàng ngói
  const [c, g] = canvas(64, 128);
  g.fillStyle = '#1f2430';
  g.fillRect(0, 0, 64, 128);
  const gr = g.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, '#20252f');
  gr.addColorStop(0.3, '#55607a');
  gr.addColorStop(0.5, '#8a96b0');
  gr.addColorStop(0.7, '#55607a');
  gr.addColorStop(1, '#20252f');
  g.fillStyle = gr;
  g.fillRect(6, 0, 52, 128);
  // khấc giữa hai viên ngói gối nhau
  g.fillStyle = 'rgba(10,12,18,0.55)';
  g.fillRect(0, 60, 64, 8);
  g.fillStyle = 'rgba(200,210,230,0.18)';
  g.fillRect(8, 68, 48, 4);
  return texture(c);
}

/** Đá hộc xếp: viên tròn cạnh, xám ấm, vữa tối. */
function vanDa(hat = 7): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = taoNgauNhien(hat);
  g.fillStyle = '#4e4b47';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 42) {
    const lech = (y / 42) % 2 ? 30 : 0;
    for (let x = -60 + lech; x < 256; x += 62) {
      const w = 54 + r() * 8;
      const h = 36 + r() * 4;
      const v = 140 + Math.floor(r() * 50);
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      g.beginPath();
      g.roundRect(x + 3, y + 3, w, h, 10);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + 8, y + 6, w - 12, 5);
    }
  }
  return texture(c);
}

/** Sân đất nện: vàng-nâu nhạt, lấm tấm. */
function vanDat(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = taoNgauNhien(11);
  // ĐẤT NỆN MỊN be-xám (ảnh mẫu) — loang mềm thay cho lấm tấm (lượt chụp 1 trông như sỏi)
  g.fillStyle = '#cdbfa8';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i += 1) {
    const x = r() * 512;
    const y = r() * 512;
    const rr = 30 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    const sang = r() < 0.5;
    gr.addColorStop(0, sang ? 'rgba(235,225,205,0.22)' : 'rgba(160,140,115,0.14)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    // vẽ cả 8 bản sao quanh ô: texture lặp lại thì vết loang nối liền, không lộ đường ghép ô
    for (const ox of [-512, 0, 512]) {
      for (const oy of [-512, 0, 512]) {
        g.save();
        g.translate(ox, oy);
        g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        g.restore();
      }
    }
  }
  return texture(c);
}

/** Đất luống: nâu sẫm có rãnh. */
function vanDatRau(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#5b3c26';
  g.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 32) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + 22, 0, 8, 128);
    g.fillStyle = 'rgba(255,220,180,0.08)';
    g.fillRect(x + 4, 0, 10, 128);
  }
  return texture(c);
}

/** Cửa lưới giấy hanji, đèn trong nhà hắt ra — dùng làm `emissiveMap`. */
function vanCuaLuoi(sang: boolean): THREE.CanvasTexture {
  const [c, g] = canvas(128, 192);
  g.fillStyle = sang ? '#ffd28a' : '#e9d9b8';
  g.fillRect(0, 0, 128, 192);
  g.strokeStyle = '#5a3a22';
  g.lineWidth = 4;
  for (let x = 0; x <= 128; x += 21) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 192);
    g.stroke();
  }
  for (let y = 0; y <= 192; y += 24) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y);
    g.stroke();
  }
  g.lineWidth = 10;
  g.strokeRect(0, 0, 128, 192);
  return texture(c, false);
}

/** Quầng sáng tròn cho đèn lồng (sprite cộng màu). */
function vanQuang(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,220,150,1)');
  gr.addColorStop(0.3, 'rgba(255,170,80,0.55)');
  gr.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return texture(c, false);
}

/* -------------------------------------------------------------- vật liệu */

type BoVatLieu = ReturnType<typeof taoVatLieu>;

function taoVatLieu() {
  const ngoiTex = vanNgoi();
  const daTex = vanDa();
  const datTex = vanDat();
  datTex.repeat.set(6, 6);
  const datRauTex = vanDatRau();
  const std = (o: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  return {
    ngoi: std({ map: ngoiTex, roughness: 0.6, side: THREE.DoubleSide }),
    ngoiNoc: std({ color: MAU.ngoiNoc, roughness: 0.6 }),
    go: std({ color: MAU.go }),
    goSang: std({ color: MAU.goSang }),
    tuong: std({ color: MAU.tuong, roughness: 0.95 }),
    da: std({ map: daTex }),
    nenDa: std({ color: MAU.da, roughness: 0.9 }),
    dat: std({ map: datTex, roughness: 1 }),
    datRau: std({ map: datRauTex, roughness: 1 }),
    cuaSang: std({
      color: 0xffffff,
      map: vanCuaLuoi(true),
      emissive: 0xffffff,
      emissiveMap: vanCuaLuoi(true),
      emissiveIntensity: 0.85,
    }),
    cuaToi: std({ color: 0xffffff, map: vanCuaLuoi(false) }),
    ongGi: std({ color: MAU.ongGi, roughness: 0.35 }),
    den: new THREE.MeshBasicMaterial({ color: MAU.den }),
    denKhung: std({ color: 0x3a2618 }),
    quang: new THREE.SpriteMaterial({
      map: vanQuang(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
    la: std({ color: MAU.la, roughness: 0.8 }),
    laSang: std({ color: MAU.laSang, roughness: 0.8 }),
    khoai: std({ color: MAU.khoai, roughness: 0.6 }),
    cu: std({ color: MAU.cu, roughness: 0.7 }),
    co: std({ color: MAU.co, roughness: 1 }),
    vo: std({ color: 0x6b4a36 }),
  };
}

/* ----------------------------------------------------------- hình học */

/** Đặt một mesh vào nhóm, có bóng hay không. */
function them(
  nhom: THREE.Object3D,
  geo: THREE.BufferGeometry,
  vl: THREE.Material,
  x: number,
  y: number,
  z: number,
  bong = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, vl);
  m.position.set(x, y, z);
  m.castShadow = bong;
  m.receiveShadow = true;
  nhom.add(m);
  return m;
}

/**
 * MÁI NGÓI CONG (giwa) kiểu mái chái: 2 mái dốc hình thang + 2 mái chái tam
 * giác, mặt dốc LÕM (võng giữa) và bốn góc VỂNH lên — đúng hai nét làm ra
 * dáng hanok.
 *
 *   y(t, s) = H · (1 − t)^1,45 + vểnh · |s|⁴ · t²
 *
 * `t` đi từ nóc (0) xuống mép (1); `s` chạy ngang mái (−1…1). Mép chung giữa
 * mái dốc và mái chái khớp nhau đúng từng đỉnh (cùng công thức ở |s| = 1) nên
 * không hở khe.
 */
export function maiNgoiCong(
  W: number,
  D: number,
  H: number,
  R: number,
  vinh: number,
  doc = 18,
  ngang = 20,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const cao = (t: number, s: number) => H * Math.pow(1 - t, 1.45) + vinh * Math.pow(Math.abs(s), 4) * t * t;
  const doDai = Math.hypot(H, D);
  const mat = (
    diem: (s: number, t: number) => [number, number, number],
    uU: (s: number, t: number) => number,
  ) => {
    const goc = pos.length / 3;
    for (let j = 0; j <= doc; j += 1) {
      const t = j / doc;
      for (let i = 0; i <= ngang; i += 1) {
        const s = (i / ngang) * 2 - 1;
        const [x, y, z] = diem(s, t);
        pos.push(x, y, z);
        uv.push(uU(s, t) / 0.24, (t * doDai) / 0.34);
      }
    }
    const hang = ngang + 1;
    for (let j = 0; j < doc; j += 1) {
      for (let i = 0; i < ngang; i += 1) {
        const a = goc + j * hang + i;
        idx.push(a, a + hang, a + 1, a + 1, a + hang, a + hang + 1);
      }
    }
  };
  const xMep = (t: number) => R + t * (W - R);
  // mái trước / sau
  for (const dau of [1, -1]) {
    mat(
      (s, t) => [s * xMep(t), cao(t, s), dau * t * D],
      (s, t) => s * xMep(t),
    );
  }
  // mái chái phải / trái
  for (const dau of [1, -1]) {
    mat(
      (s, t) => [dau * xMep(t), cao(t, s), s * t * D],
      (s, t) => s * t * D,
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Lu sành onggi: tiện tròn, bụng phình, miệng hẹp. */
function ongGi(cao: number): THREE.BufferGeometry {
  const r = cao * 0.42;
  const pts = [
    [0, 0],
    [r * 0.55, 0],
    [r * 0.85, cao * 0.18],
    [r, cao * 0.5],
    [r * 0.82, cao * 0.82],
    [r * 0.55, cao * 0.94],
    [r * 0.58, cao],
    [0, cao],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 14);
}

/* ----------------------------------------------------------- công trình */

interface BoDung {
  nhom: THREE.Group;
  vl: BoVatLieu;
  den: THREE.Vector3[];
  /** Hộp chắn (đế nhà, tường) — phơi ra để sau này lái nhân vật không xuyên. */
  chan: Array<{ id: string; min: [number, number, number]; max: [number, number, number] }>;
}

/** Một đèn lồng giấy: thân sáng + khung + quầng. */
function denLong(b: BoDung, x: number, y: number, z: number, co = 1): void {
  const than = them(b.nhom, new THREE.CylinderGeometry(0.16 * co, 0.16 * co, 0.34 * co, 10), b.vl.den, x, y, z, false);
  than.castShadow = false;
  them(b.nhom, new THREE.CylinderGeometry(0.12 * co, 0.17 * co, 0.05 * co, 10), b.vl.denKhung, x, y + 0.19 * co, z, false);
  them(b.nhom, new THREE.CylinderGeometry(0.17 * co, 0.12 * co, 0.05 * co, 10), b.vl.denKhung, x, y - 0.19 * co, z, false);
  const q = new THREE.Sprite(b.vl.quang);
  q.position.set(x, y, z);
  q.scale.setScalar(1.9 * co);
  b.nhom.add(q);
  b.den.push(new THREE.Vector3(x, y, z));
}

/** Cột đèn: trụ gỗ + tay vươn + đèn lồng treo. */
function cotDen(b: BoDung, x: number, z: number, huong = 1): void {
  them(b.nhom, new THREE.BoxGeometry(0.12, 2.3, 0.12), b.vl.go, x, 1.15, z);
  them(b.nhom, new THREE.BoxGeometry(0.55, 0.08, 0.08), b.vl.go, x + 0.24 * huong, 2.22, z);
  them(b.nhom, new THREE.CylinderGeometry(0.015, 0.015, 0.22, 4), b.vl.denKhung, x + 0.45 * huong, 2.08, z, false);
  denLong(b, x + 0.45 * huong, 1.82, z, 1.05);
}

interface NhaOpt {
  id: string;
  x: number;
  z: number;
  /** Bề ngang mặt tiền (m). */
  w: number;
  /** Bề sâu (m). */
  d: number;
  /** Quay quanh trục đứng (độ) — 0 = mặt tiền nhìn +Z. */
  quay: number;
  /** Ô cửa nào sáng đèn (theo thứ tự trái → phải ở mặt tiền). */
  sang: boolean[];
}

/** Một căn hanok: nền đá, cột gỗ, vách vữa, cửa lưới, hiên gỗ, mái ngói cong. */
function nhaHanok(b: BoDung, o: NhaOpt): void {
  const g = new THREE.Group();
  const sub: BoDung = { ...b, nhom: g };
  const nen = 0.5;
  const cot = 1.85;
  // nền đá + bậc
  them(g, new THREE.BoxGeometry(o.w + 1.0, nen, o.d + 1.0), b.vl.da, 0, nen / 2, 0);
  them(g, new THREE.BoxGeometry(1.4, 0.25, 0.45), b.vl.nenDa, 0, 0.125, o.d / 2 + 0.72);
  // vách
  them(g, new THREE.BoxGeometry(o.w, cot, o.d), b.vl.tuong, 0, nen + cot / 2, 0);
  // cột ở mặt tiền + bốn góc
  const soNhip = o.sang.length;
  for (let i = 0; i <= soNhip; i += 1) {
    const x = -o.w / 2 + (o.w * i) / soNhip;
    them(g, new THREE.BoxGeometry(0.16, cot, 0.16), b.vl.go, x, nen + cot / 2, o.d / 2 + 0.02);
    them(g, new THREE.BoxGeometry(0.16, cot, 0.16), b.vl.go, x, nen + cot / 2, -o.d / 2 - 0.02);
  }
  // xà đầu cột + đố ngang chân vách
  them(g, new THREE.BoxGeometry(o.w + 0.3, 0.2, o.d + 0.3), b.vl.go, 0, nen + cot + 0.05, 0);
  them(g, new THREE.BoxGeometry(o.w + 0.02, 0.14, o.d + 0.02), b.vl.goSang, 0, nen + 0.07, 0);
  // cửa lưới giữa các cột
  for (let i = 0; i < soNhip; i += 1) {
    const x = -o.w / 2 + (o.w * (i + 0.5)) / soNhip;
    const rong = (o.w / soNhip) * 0.72;
    them(
      g,
      new THREE.PlaneGeometry(rong, cot * 0.74),
      o.sang[i] ? b.vl.cuaSang : b.vl.cuaToi,
      x,
      nen + cot * 0.47,
      o.d / 2 + 0.012,
      false,
    );
  }
  // hiên gỗ (maru) trước nửa mặt tiền
  them(g, new THREE.BoxGeometry(o.w * 0.55, 0.1, 0.7), b.vl.goSang, -o.w * 0.18, nen + 0.12, o.d / 2 + 0.4);
  // mái
  const W = o.w / 2 + 0.95;
  const D = o.d / 2 + 0.95;
  const mai = them(g, maiNgoiCong(W, D, 1.25, o.w * 0.3, 0.46), b.vl.ngoi, 0, nen + cot + 0.12, 0);
  mai.receiveShadow = true;
  // mặt dưới mái = lớp rui gỗ, hạ 0,12 m: nhìn từ trên thấy MÉP mái có độ dày (ảnh mẫu), không phải tờ giấy
  them(g, maiNgoiCong(W - 0.05, D - 0.05, 1.25, o.w * 0.3, 0.46), b.vl.go, 0, nen + cot + 0.0, 0, false);
  them(g, new THREE.BoxGeometry(o.w * 0.6 + 0.3, 0.2, 0.28), b.vl.ngoiNoc, 0, nen + cot + 1.42, 0);
  for (const dau of [1, -1]) {
    const dauNoc = them(
      g,
      new THREE.BoxGeometry(0.34, 0.16, 0.26),
      b.vl.ngoiNoc,
      dau * (o.w * 0.3 + 0.2),
      nen + cot + 1.5,
      0,
    );
    dauNoc.rotation.z = dau * 0.45;
  }
  // đèn lồng treo hai góc hiên
  for (const dau of [1, -1]) {
    them(g, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), b.vl.denKhung, dau * (o.w / 2 + 0.25), nen + cot - 0.05, o.d / 2 + 0.5, false);
    denLong(sub, dau * (o.w / 2 + 0.25), nen + cot - 0.38, o.d / 2 + 0.5);
  }
  g.position.set(o.x, 0, o.z);
  g.rotation.y = THREE.MathUtils.degToRad(o.quay);
  b.nhom.add(g);
  // đèn của nhà nằm trong hệ toạ độ nhà → đổi sang thế giới cho đèn điểm thật
  g.updateMatrixWorld(true);
  const truoc = b.den.length - 2;
  for (let i = truoc; i < b.den.length; i += 1) b.den[i]!.applyMatrix4(g.matrixWorld);
  const box = new THREE.Box3().setFromObject(g);
  b.chan.push({ id: o.id, min: [box.min.x, 0, box.min.z], max: [box.max.x, box.max.y, box.max.z] });
}

/** Nhà kho gỗ mái ván (ảnh tham chiếu: căn phía sau, tông nâu). */
function nhaKho(b: BoDung, x: number, z: number): void {
  const g = new THREE.Group();
  them(g, new THREE.BoxGeometry(4.2, 0.35, 3.2), b.vl.da, 0, 0.175, 0);
  them(g, new THREE.BoxGeometry(3.6, 1.8, 2.6), b.vl.goSang, 0, 0.35 + 0.9, 0);
  for (const x0 of [-1.8, -0.6, 0.6, 1.8]) them(g, new THREE.BoxGeometry(0.14, 1.8, 0.14), b.vl.go, x0, 1.25, 1.32);
  them(g, new THREE.BoxGeometry(1.0, 1.35, 0.05), b.vl.go, 0, 1.03, 1.32);
  const mai = maiNgoiCong(2.5, 2.0, 1.05, 1.2, 0.12, 10, 12);
  them(g, mai, b.vl.vo, 0, 2.16, 0);
  g.position.set(x, 0, z);
  b.nhom.add(g);
  b.chan.push({ id: 'nha-kho', min: [x - 2.1, 0, z - 1.6], max: [x + 2.1, 3.3, z + 1.6] });
}

/** Tường đá có mũ ngói, từ (x1,z1) tới (x2,z2). */
function tuongDa(b: BoDung, x1: number, z1: number, x2: number, z2: number): void {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const L = Math.hypot(dx, dz);
  const g = new THREE.Group();
  const dat = b.vl.da.clone();
  dat.map = b.vl.da.map!.clone();
  dat.map.needsUpdate = true;
  dat.map.repeat.set(L / 1.4, 0.75);
  them(g, new THREE.BoxGeometry(L, 1.05, 0.42), dat, 0, 0.525, 0);
  // mũ ngói: hai tấm nghiêng + sống
  for (const dau of [1, -1]) {
    const t = them(g, new THREE.BoxGeometry(L + 0.2, 0.05, 0.38), b.vl.ngoi, 0, 1.13, dau * 0.15, true);
    t.rotation.x = dau * 0.42;
  }
  them(g, new THREE.BoxGeometry(L + 0.24, 0.1, 0.12), b.vl.ngoiNoc, 0, 1.22, 0);
  g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
  g.rotation.y = -Math.atan2(dz, dx);
  b.nhom.add(g);
  b.chan.push({
    id: `tuong-${b.chan.length}`,
    min: [Math.min(x1, x2) - 0.21, 0, Math.min(z1, z2) - 0.21],
    max: [Math.max(x1, x2) + 0.21, 1.3, Math.max(z1, z2) + 0.21],
  });
}

/** Cổng gỗ nhỏ có mái ngói (góc dưới trái ảnh tham chiếu). */
function congGo(b: BoDung, x: number, z: number, quay: number): void {
  const g = new THREE.Group();
  for (const dau of [1, -1]) them(g, new THREE.BoxGeometry(0.22, 2.0, 0.22), b.vl.go, dau * 0.9, 1.0, 0);
  them(g, new THREE.BoxGeometry(2.2, 0.18, 0.3), b.vl.go, 0, 2.0, 0);
  them(g, new THREE.BoxGeometry(1.55, 1.75, 0.06), b.vl.goSang, 0, 0.95, 0);
  them(g, maiNgoiCong(1.55, 0.75, 0.55, 0.9, 0.18, 8, 10), b.vl.ngoi, 0, 2.08, 0);
  them(g, new THREE.BoxGeometry(1.9, 0.12, 0.18), b.vl.ngoiNoc, 0, 2.66, 0);
  const sub: BoDung = { ...b, nhom: g };
  const truoc = b.den.length;
  denLong(sub, 0.95, 1.55, 0.35);
  denLong(sub, -0.95, 1.55, 0.35);
  g.position.set(x, 0, z);
  g.rotation.y = THREE.MathUtils.degToRad(quay);
  b.nhom.add(g);
  g.updateMatrixWorld(true);
  for (let i = truoc; i < b.den.length; i += 1) b.den[i]!.applyMatrix4(g.matrixWorld);
}

/* ------------------------------------------------------ cây cỏ (instanced) */

/** Gom vị trí rồi dựng MỘT `InstancedMesh` mỗi loại — một lượt vẽ cho cả loại. */
class Kho {
  private ds = new Map<string, { geo: THREE.BufferGeometry; vl: THREE.Material; m: THREE.Matrix4[]; mau?: THREE.Color[]; bong: boolean }>();
  dat(
    loai: string,
    geo: () => THREE.BufferGeometry,
    vl: THREE.Material,
    vt: THREE.Vector3,
    co: THREE.Vector3,
    quay = 0,
    mau?: number,
    bong = true,
  ): void {
    let e = this.ds.get(loai);
    if (!e) {
      e = { geo: geo(), vl, m: [], bong };
      this.ds.set(loai, e);
    }
    e.m.push(new THREE.Matrix4().compose(vt, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, quay, 0)), co));
    if (mau !== undefined) (e.mau ??= []).push(new THREE.Color(mau));
  }
  dung(nhom: THREE.Object3D): void {
    for (const [ten, e] of this.ds) {
      const im = new THREE.InstancedMesh(e.geo, e.vl, e.m.length);
      im.name = `lang:${ten}`;
      e.m.forEach((m, i) => im.setMatrixAt(i, m));
      if (e.mau) e.mau.forEach((c, i) => im.setColorAt(i, c));
      im.castShadow = e.bong;
      im.receiveShadow = true;
      nhom.add(im);
    }
  }
}

/** Khóm lá: vài khối 20 mặt dẹt ghép lại (rau, bụi). */
function khomLa(soKhoi: number, r: number, cao: number, hat: number): THREE.BufferGeometry {
  const ng = taoNgauNhien(hat);
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < soKhoi; i += 1) {
    const g = new THREE.IcosahedronGeometry(r * (0.7 + ng() * 0.5), 0);
    const goc = (i / soKhoi) * Math.PI * 2 + ng();
    g.scale(1, 0.55, 1);
    g.translate(Math.cos(goc) * r * 0.7, cao * (0.4 + ng() * 0.6), Math.sin(goc) * r * 0.7);
    geos.push(g.toNonIndexed());
  }
  return gop(geos);
}

function gop(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const g of geos) pos.push(...(g.getAttribute('position').array as Float32Array));
  const ra = new THREE.BufferGeometry();
  ra.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ra.computeVertexNormals();
  return ra;
}

/** Cây đậu leo: thân mảnh + lá xếp tầng. */
function cayDau(): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.02, 0.025, 0.9, 5).translate(0, 0.45, 0).toNonIndexed()];
  for (let i = 0; i < 6; i += 1) {
    const g = new THREE.IcosahedronGeometry(0.11, 0);
    g.scale(1.2, 0.35, 0.8);
    const goc = i * 2.1;
    g.translate(Math.cos(goc) * 0.11, 0.2 + i * 0.13, Math.sin(goc) * 0.11);
    geos.push(g.toNonIndexed());
  }
  return gop(geos);
}

/** Bóng cây anh đào: chùm cầu thấp đa giác quanh ngọn. */
function tanAnhDao(hat: number): THREE.BufferGeometry {
  const ng = taoNgauNhien(hat);
  const geos: THREE.BufferGeometry[] = [];
  // nhiều chùm NHỎ, mặt phẳng (flat) — chùm to tròn trông như bóng bay (lượt chụp đầu)
  for (let i = 0; i < 26; i += 1) {
    const g = new THREE.IcosahedronGeometry(0.22 + ng() * 0.2, 0);
    const goc = ng() * Math.PI * 2;
    const r = Math.sqrt(ng()) * 1.0;
    g.translate(Math.cos(goc) * r, (ng() - 0.35) * 0.8, Math.sin(goc) * r);
    geos.push(g.toNonIndexed());
  }
  return gop(geos);
}

/* ------------------------------------------------------------- dựng làng */

export interface Lang extends Phong {
  /** Vị trí đèn lồng (thế giới) — `World` đặt vài đèn điểm thật ở các đèn gần tâm. */
  denLong: THREE.Vector3[];
}

/**
 * Cảnh mặc định là LÀNG (Ryan 27/10: "thay toàn bộ, đâu cần giữ kiểu cũ").
 * `?canh=nha` còn mở được căn nhà cũ CHỈ để so trong lúc Ryan duyệt hình — duyệt
 * xong thì xoá hẳn nhánh đó.
 */
export function chonCanh(search = typeof location !== 'undefined' ? location.search : ''): 'lang' | 'nha' {
  return new URLSearchParams(search).get('canh') === 'nha' ? 'nha' : 'lang';
}

export async function dungLang(scene: THREE.Scene): Promise<Lang> {
  const nhom = new THREE.Group();
  nhom.name = 'lang';
  const vl = taoVatLieu();
  const b: BoDung = { nhom, vl, den: [], chan: [] };
  const kho = new Kho();
  const ng = taoNgauNhien(42);

  // nền đất toàn làng (fog nuốt mép xa)
  const nen = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), vl.dat);
  nen.rotation.x = -Math.PI / 2;
  nen.receiveShadow = true;
  nhom.add(nen);

  // ---- nhà ----
  nhaHanok(b, { id: 'nha-chinh', x: 1.0, z: -7.2, w: 6.2, d: 3.4, quay: 0, sang: [true, false, true, true] });
  nhaHanok(b, { id: 'nha-tay', x: -8.6, z: -8.8, w: 5.2, d: 3.2, quay: 0, sang: [true, true, false] });
  nhaHanok(b, { id: 'nha-dong', x: 10.2, z: -2.4, w: 5.0, d: 3.2, quay: -90, sang: [false, true, true] });
  nhaKho(b, 8.6, -10.6);

  // ---- tường đá bao vườn tây + cổng ----
  tuongDa(b, -12.5, -4.2, -3.0, -4.2);
  tuongDa(b, -12.5, -4.2, -12.5, 8.5);
  tuongDa(b, -12.5, 8.5, -5.4, 8.5);
  congGo(b, -4.2, 8.5, 0);
  tuongDa(b, 4.6, -4.8, 7.6, -4.8);

  // ---- luống rau ----
  const luong = (x0: number, z0: number, w: number, d: number, loai: 'dau' | 'khoai' | 'cu') => {
    them(nhom, new THREE.BoxGeometry(w, 0.2, d), vl.datRau, x0, 0.1, z0, false);
    const hang = Math.max(2, Math.round(d / 0.7));
    const cot = Math.max(3, Math.round(w / 0.6));
    for (let i = 0; i < cot; i += 1) {
      for (let j = 0; j < hang; j += 1) {
        const x = x0 - w / 2 + (w * (i + 0.5)) / cot + (ng() - 0.5) * 0.08;
        const z = z0 - d / 2 + (d * (j + 0.5)) / hang + (ng() - 0.5) * 0.08;
        const co = 0.85 + ng() * 0.35;
        if (loai === 'dau') {
          kho.dat('dau', cayDau, vl.laSang, new THREE.Vector3(x, 0.2, z), new THREE.Vector3(co, co * (0.8 + ng() * 0.5), co), ng() * 6);
        } else if (loai === 'khoai') {
          kho.dat('khoai-la', () => khomLa(5, 0.13, 0.22, 3), vl.la, new THREE.Vector3(x, 0.2, z), new THREE.Vector3(co, co, co), ng() * 6);
          kho.dat('khoai-cu', () => new THREE.SphereGeometry(0.07, 8, 6).scale(1.6, 0.8, 1), vl.khoai, new THREE.Vector3(x + 0.12, 0.22, z + 0.05), new THREE.Vector3(1, 1, 1), ng() * 6, undefined, false);
        } else {
          kho.dat('cu-la', () => khomLa(4, 0.1, 0.3, 5), vl.laSang, new THREE.Vector3(x, 0.2, z), new THREE.Vector3(co, co * 1.2, co), ng() * 6);
          kho.dat('cu-re', () => new THREE.ConeGeometry(0.05, 0.22, 6).rotateX(Math.PI), vl.cu, new THREE.Vector3(x, 0.24, z), new THREE.Vector3(1, 1, 1), 0, undefined, false);
        }
      }
    }
  };
  luong(-7.6, -2.0, 6.4, 2.4, 'dau');
  luong(-7.6, 1.6, 6.4, 2.6, 'dau');
  luong(-7.2, 5.6, 5.6, 2.6, 'khoai');
  luong(5.6, 4.2, 4.2, 2.6, 'cu');
  luong(0.4, 7.2, 4.4, 2.2, 'khoai');

  // ---- cột đèn ----
  cotDen(b, -2.3, -3.6, 1);
  cotDen(b, 4.0, -4.4, -1);
  cotDen(b, -2.3, 3.2, 1);
  cotDen(b, 7.8, 1.4, -1);

  // ---- lu sành ----
  const lu = (x: number, z: number, cao: number) =>
    kho.dat(`lu-${cao}`, () => ongGi(cao), vl.ongGi, new THREE.Vector3(x, 0, z), new THREE.Vector3(1, 1, 1), ng() * 6);
  lu(5.6, -6.0, 0.7);
  lu(6.2, -5.6, 0.5);
  lu(5.9, -6.6, 0.5);
  lu(11.4, -9.0, 0.9);
  lu(-5.2, -6.6, 0.6);

  // ---- cây anh đào + bụi hoa ----
  const anhDao = (x: number, z: number, h: number) => {
    them(nhom, new THREE.CylinderGeometry(0.08, 0.16, h, 7), vl.vo, x, h / 2, z);
    kho.dat('anh-dao', () => tanAnhDao(9), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), new THREE.Vector3(x, h + 0.35, z), new THREE.Vector3(1, 1, 1), ng() * 6, MAU.anhDao[Math.floor(ng() * 3)]);
  };
  anhDao(-14.0, -6.0, 2.2);
  anhDao(-14.5, -1.0, 1.9);
  anhDao(13.5, -7.5, 2.1);
  anhDao(-1.6, -11.5, 2.3);
  const vlHoa = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  // bụi = khóm lá xanh + hàng chục bông nhỏ phủ trên (ảnh mẫu: đỗ quyên), không phải quả cầu màu
  const vlHoaPhang = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
  const bui = (x: number, z: number) => {
    const mau = MAU.hoa[Math.floor(ng() * MAU.hoa.length)]!;
    const n = 2 + Math.floor(ng() * 2);
    for (let i = 0; i < n; i += 1) {
      const cx = x + (ng() - 0.5) * 0.8;
      const cz = z + (ng() - 0.5) * 0.8;
      const r = 0.42 + ng() * 0.2;
      kho.dat('bui-la', () => khomLa(6, 0.32, 0.5, 13), vl.la, new THREE.Vector3(cx, 0, cz), new THREE.Vector3(r * 1.7, r * 1.3, r * 1.7), ng() * 6);
      for (let k = 0; k < 34; k += 1) {
        const goc = ng() * Math.PI * 2;
        const rr = Math.sqrt(ng()) * r * 0.85;
        kho.dat('bong-hoa', () => new THREE.IcosahedronGeometry(0.1, 0), vlHoaPhang, new THREE.Vector3(cx + Math.cos(goc) * rr, r * 0.55 + ng() * r * 0.45, cz + Math.sin(goc) * rr), new THREE.Vector3(1, 1, 1), ng() * 6, ng() < 0.85 ? mau : 0xfff0f6, false);
      }
    }
  };
  void vlHoa;
  for (const [x, z] of [[-11.5, -3.2], [-11.4, 7.5], [-6.4, 9.6], [-2.4, 9.7], [3.0, 9.5], [8.4, 6.4], [-3.2, -5.6], [12.2, 2.4], [4.4, -9.6], [-12.2, 3.0]] as const) bui(x, z);

  for (const [x, z] of [[-1.2, -4.6], [5.0, -4.4], [-9.8, -6.0], [-4.6, -10.4], [12.8, -5.6], [-0.4, 4.6], [9.8, 3.8]] as const) bui(x, z);

  // ---- mảng cỏ sẫm lổn nhổn trên nền đất (đỡ trống sân, ảnh mẫu có rêu cỏ mép lối) ----
  const vlMangCo = new THREE.MeshStandardMaterial({ color: 0x6f8a46, roughness: 1 });
  for (const [x, z, r] of [[-14, 3, 2.2], [13, 6, 2.6], [3.5, 10.5, 2.4], [-9, 11, 2.0], [14.5, -2, 1.6], [-4, -12.5, 2.2], [11, -13, 2.0], [-16, -9, 2.4]] as const) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 9), vlMangCo);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    m.receiveShadow = true;
    nhom.add(m);
  }

  // ---- đồ lặt vặt quanh nhà: thùng gỗ, đống củi, sọt ----
  const thung = (x: number, z: number, c: number, quay: number) => {
    const m = them(nhom, new THREE.BoxGeometry(c, c * 0.8, c), vl.goSang, x, (c * 0.8) / 2, z);
    m.rotation.y = quay;
  };
  thung(-3.4, -6.4, 0.5, 0.3);
  thung(-3.0, -6.0, 0.36, 0.9);
  thung(6.6, -9.0, 0.55, 0.2);
  thung(12.0, -9.6, 0.4, 0.7);
  for (let i = 0; i < 5; i += 1) {
    const k = them(nhom, new THREE.CylinderGeometry(0.09, 0.09, 1.0, 6), vl.go, 6.3 + (i % 3) * 0.19, 0.1 + Math.floor(i / 3) * 0.17, -12.2);
    k.rotation.z = Math.PI / 2;
  }

  // ---- cỏ lún phún quanh mép tường + ngoài làng ----
  const vlCo = vl.co;
  for (let i = 0; i < 220; i += 1) {
    const x = (ng() - 0.5) * 34;
    const z = (ng() - 0.5) * 30;
    const trongSan = x > -4 && x < 9 && z > -5 && z < 3;
    if (trongSan) continue;
    kho.dat('co', () => new THREE.ConeGeometry(0.06, 0.24, 4), vlCo, new THREE.Vector3(x, 0.1, z), new THREE.Vector3(1, 0.7 + ng(), 1), ng() * 6, undefined, false);
  }

  // ---- đá lát lối đi trước nhà chính ----
  for (let i = 0; i < 6; i += 1) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.06, 8), vl.nenDa);
    s.position.set(1.0 + Math.sin(i * 0.8) * 0.25, 0.03, -4.6 + i * 0.85);
    s.receiveShadow = true;
    nhom.add(s);
  }

  kho.dung(nhom);
  scene.add(nhom);
  const truocGop = (() => {
    let n = 0;
    nhom.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) n += 1;
    });
    return n;
  })();
  const gopKq = gopTinh(nhom);

  const hopKhoi = new Map<string, { min: [number, number, number]; max: [number, number, number] }>();
  for (const c of b.chan) hopKhoi.set(c.id, { min: c.min, max: c.max });
  return {
    nhom,
    dungKenney: false,
    gop: { truoc: truocGop, sau: gopKq.sau },
    noc: new Map(),
    day: new Map(),
    matNgoi: new Map(),
    hopKhoi,
    denLong: b.den,
  };
}
