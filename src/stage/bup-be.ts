/**
 * NHÂN VẬT BÚP BÊ — phong cách "đồ chơi diorama" (Ryan 27/10: ảnh làng hanok,
 * rồi "dùng dạng búp bê đó cũng được nhưng chất lượng cao hơn", bối cảnh văn
 * phòng công ty lớn).
 *
 * Búp bê chỉ là LỚP HÌNH. Bộ não hành động (đi, quay, nói, hàng đợi lệnh…) vẫn
 * là `NhanVat` với VRM ẩn bên dưới — Actor API, bridge, MCP không đổi gì.
 * `World` chép vị trí + hướng sang búp bê mỗi khung; búp bê tự diễn nhún, vung
 * tay, nhép miệng theo `state`.
 *
 * Chất lượng tăng so với bản hanbok: thân khối BO TRÒN (RoundedBox), mặt dán
 * lên một MẢNH CẦU (cong theo đầu, không phải tấm phẳng), mắt có điểm sáng +
 * chân mày, tóc có mái, đồ công sở có cổ áo / cà vạt / thẻ tên.
 * Rẻ: ~20 mesh, vài nghìn tam giác, không skinning — búp bê đứng yên (nhân
 * viên) còn được `gopTinh()` gộp chung với cảnh.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { vanBongDat } from './lang';

export interface KieuBupBe {
  /** Màu áo. */
  ao: number;
  /** Màu váy / quần. */
  duoi: number;
  kieuDuoi: 'vay' | 'quan';
  /** Kiểu tóc. */
  toc: 'bui' | 'ngan' | 'dai' | 'buoc';
  mauToc?: number;
  /** Phụ kiện công sở. */
  phuKien?: 'ca-vat' | 'the-ten' | 'kinh';
  mauPhuKien?: number;
  da?: number;
  /** Cỡ tổng (1 = cao ~1,0 m). */
  co?: number;
}

const DA = 0xf3d3b6;
const TOC = 0x2a2124;

/** Mặt vẽ trên canvas 256 px: mắt có điểm sáng, chân mày, má hồng, mũi chấm, miệng. */
function veMat(mo: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  // mắt
  for (const x of [92, 164]) {
    g.fillStyle = '#231a1c';
    g.beginPath();
    g.ellipse(x, 124, 13, 17, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x + 4, 116, 5, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(x - 4, 131, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  // chân mày
  g.strokeStyle = '#3a2a26';
  g.lineWidth = 5;
  g.lineCap = 'round';
  for (const x of [92, 164]) {
    g.beginPath();
    g.arc(x, 104, 16, 1.2 * Math.PI, 1.8 * Math.PI);
    g.stroke();
  }
  // má
  g.fillStyle = 'rgba(240,120,120,0.38)';
  for (const x of [72, 184]) {
    g.beginPath();
    g.ellipse(x, 160, 20, 12, 0, 0, Math.PI * 2);
    g.fill();
  }
  // mũi
  g.fillStyle = 'rgba(200,120,100,0.5)';
  g.beginPath();
  g.ellipse(128, 150, 4, 3, 0, 0, Math.PI * 2);
  g.fill();
  // miệng
  if (mo) {
    g.fillStyle = '#8f3438';
    g.beginPath();
    g.ellipse(128, 176, 12, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e57a7f';
    g.beginPath();
    g.ellipse(128, 181, 7, 4, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    g.strokeStyle = '#8f3438';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(128, 166, 13, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let matKhep: THREE.CanvasTexture | null = null;
let matMo: THREE.CanvasTexture | null = null;
let bongChan: THREE.MeshBasicMaterial | null = null;
const boVl = new Map<string, THREE.MeshStandardMaterial>();

/** Vật liệu dùng chung theo (màu, nhám) — để cảnh gộp được nhiều búp bê một lượt vẽ. */
function std(color: number, roughness = 0.7): THREE.MeshStandardMaterial {
  const k = `${color}|${roughness}`;
  let v = boVl.get(k);
  if (!v) {
    v = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    boVl.set(k, v);
  }
  return v;
}

function luoi(geo: THREE.BufferGeometry, vl: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, vl);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Một búp bê. `goc` đặt vào cảnh; `dien()` gọi mỗi khung. */
export class BupBe {
  readonly goc = new THREE.Group();
  private than = new THREE.Group();
  private dau = new THREE.Group();
  private tayTrai = new THREE.Group();
  private tayPhai = new THREE.Group();
  private chan = new THREE.Group();
  private mat: THREE.MeshBasicMaterial;
  private t = Math.random() * 10;
  private nhipMieng = 0;

  constructor(k: KieuBupBe) {
    matKhep ??= veMat(false);
    matMo ??= veMat(true);
    const co = k.co ?? 1;
    const vlAo = std(k.ao);
    const vlDuoi = std(k.duoi);
    const vlDa = std(k.da ?? DA, 0.55);
    const vlToc = std(k.mauToc ?? TOC, 0.4);
    const vlTrang = std(0xfbf8f2);
    const vlGiay = std(0x2b2427, 0.45);

    // ---- chân + giày (nhóm riêng để ngồi gập được) ----
    this.chan.position.y = 0.3;
    for (const dau of [1, -1]) {
      const g = luoi(new THREE.SphereGeometry(0.06, 10, 6), vlGiay, dau * 0.075, -0.27, 0.035);
      g.scale.set(1, 0.62, 1.55);
      this.chan.add(g);
      const ong = luoi(new THREE.CapsuleGeometry(0.058, 0.17, 4, 8), k.kieuDuoi === 'quan' ? vlDuoi : vlDa, dau * 0.075, -0.13, 0);
      this.chan.add(ong);
    }
    this.than.add(this.chan);
    if (k.kieuDuoi === 'vay') {
      const p = [
        [0, 0.2],
        [0.2, 0.2],
        [0.19, 0.26],
        [0.16, 0.38],
        [0.14, 0.43],
        [0, 0.43],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      this.than.add(luoi(new THREE.LatheGeometry(p, 16), vlDuoi));
    } else {
      this.than.add(luoi(new RoundedBoxGeometry(0.27, 0.14, 0.18, 3, 0.06), vlDuoi, 0, 0.36, 0));
    }

    // ---- thân áo bo tròn + cổ áo + phụ kiện ----
    this.than.add(luoi(new RoundedBoxGeometry(0.29, 0.25, 0.19, 3, 0.085), vlAo, 0, 0.52, 0));
    for (const dau of [1, -1]) {
      const coAo = luoi(new THREE.BoxGeometry(0.075, 0.05, 0.02), vlTrang, dau * 0.04, 0.625, 0.093);
      coAo.rotation.z = dau * -0.5;
      this.than.add(coAo);
    }
    if (k.phuKien === 'ca-vat') {
      const vlCv = std(k.mauPhuKien ?? 0x2f4a7a, 0.5);
      this.than.add(luoi(new THREE.BoxGeometry(0.03, 0.025, 0.02), vlCv, 0, 0.6, 0.1));
      const cv = luoi(new THREE.ConeGeometry(0.03, 0.15, 4), vlCv, 0, 0.52, 0.1);
      cv.rotation.x = Math.PI;
      cv.scale.z = 0.35;
      this.than.add(cv);
    } else if (k.phuKien === 'the-ten') {
      const day = luoi(new THREE.TorusGeometry(0.09, 0.006, 4, 16, Math.PI), std(k.mauPhuKien ?? 0xd9534f, 0.5), 0, 0.6, 0.09);
      day.rotation.z = Math.PI;
      this.than.add(day);
      this.than.add(luoi(new RoundedBoxGeometry(0.06, 0.075, 0.012, 2, 0.006), vlTrang, 0, 0.5, 0.1));
    }

    // ---- tay (khớp ở vai để vung) ----
    for (const [nhom, dau] of [
      [this.tayTrai, 1],
      [this.tayPhai, -1],
    ] as const) {
      nhom.position.set(dau * 0.165, 0.6, 0);
      nhom.add(luoi(new THREE.CapsuleGeometry(0.048, 0.15, 4, 8), vlAo, 0, -0.1, 0));
      nhom.add(luoi(new THREE.SphereGeometry(0.04, 8, 6), vlDa, 0, -0.205, 0.005));
      nhom.rotation.z = dau * 0.16;
      this.than.add(nhom);
    }

    // ---- đầu: cầu hơi dẹt + mặt dán lên MẢNH CẦU (cong theo đầu) ----
    this.dau.position.set(0, 0.855, 0);
    const soDau = luoi(new THREE.SphereGeometry(0.21, 22, 16), vlDa);
    soDau.scale.set(1, 0.95, 0.96);
    this.dau.add(soDau);
    this.dau.add(luoi(new THREE.SphereGeometry(0.035, 10, 8), vlDa, 0.205, -0.01, 0));
    this.dau.add(luoi(new THREE.SphereGeometry(0.035, 10, 8), vlDa, -0.205, -0.01, 0));
    this.mat = new THREE.MeshBasicMaterial({ map: matKhep, transparent: true, depthWrite: false });
    const manhMat = new THREE.Mesh(
      new THREE.SphereGeometry(0.2035, 16, 12, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.28, Math.PI * 0.45),
      this.mat,
    );
    manhMat.scale.set(1, 0.95, 0.96);
    manhMat.rotation.y = -Math.PI / 2;
    this.dau.add(manhMat);

    // tóc: chỏm + gáy + mái
    const chom = luoi(new THREE.SphereGeometry(0.222, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), vlToc);
    chom.scale.set(1, 0.98, 0.98);
    chom.rotation.x = -0.28;
    this.dau.add(chom);
    const gay = luoi(new THREE.SphereGeometry(0.216, 14, 10, Math.PI * 0.3, Math.PI * 0.4, 0.25, Math.PI * 0.55), vlToc);
    gay.rotation.y = Math.PI / 2;
    this.dau.add(gay);
    const mai = luoi(new THREE.CapsuleGeometry(0.045, 0.2, 6, 12), vlToc, 0, 0.115, 0.15);
    mai.rotation.z = Math.PI / 2;
    mai.rotation.x = 0.45;
    this.dau.add(mai);
    if (k.toc === 'bui') {
      this.dau.add(luoi(new THREE.SphereGeometry(0.09, 16, 12), vlToc, 0, 0.1, -0.2));
    } else if (k.toc === 'buoc') {
      const duoi = luoi(new THREE.CapsuleGeometry(0.055, 0.2, 6, 12), vlToc, 0, -0.04, -0.24);
      duoi.rotation.x = 0.35;
      this.dau.add(duoi);
    } else if (k.toc === 'dai') {
      this.dau.add(luoi(new RoundedBoxGeometry(0.4, 0.34, 0.14, 3, 0.06), vlToc, 0, -0.12, -0.11));
    }
    if (k.phuKien === 'kinh') {
      const vlK = std(0x2a2a2e, 0.3);
      for (const dau of [1, -1]) {
        const v = luoi(new THREE.TorusGeometry(0.045, 0.007, 6, 18), vlK, dau * 0.07, 0.005, 0.2);
        this.dau.add(v);
      }
    }
    this.than.add(this.dau);

    // bóng tiếp xúc dưới chân
    bongChan ??= new THREE.MeshBasicMaterial({ map: vanBongDat(), transparent: true, opacity: 0.6, depthWrite: false, color: 0x000000 });
    const bong = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), bongChan);
    bong.rotation.x = -Math.PI / 2;
    bong.position.y = 0.01;
    bong.renderOrder = 1;
    this.goc.add(bong);
    this.goc.add(this.than);
    this.goc.scale.setScalar(co);
  }

  /**
   * Diễn một khung theo trạng thái: đi = nhún + lắc + vung tay; nói = gật + nhép
   * miệng; ngồi = gập chân (hông đặt lên mặt ghế — `World` nâng `goc` lên đúng
   * mặt ghế); cầm đồ = tay đó đưa ra trước.
   */
  dien(dt: number, trangThai: string, dangNoi: boolean, tayCam: 'left' | 'right' | null = null): void {
    this.t += dt;
    const t = this.t;
    const ngoi = trangThai === 'sitting';
    let nhun = 0;
    let lac = 0;
    let vung = 0;
    if (trangThai === 'walking') {
      nhun = Math.abs(Math.sin(t * 9)) * 0.04;
      lac = Math.sin(t * 9) * 0.06;
      vung = Math.sin(t * 9) * 0.6;
    } else if (trangThai === 'emoting' || trangThai === 'playing') {
      nhun = Math.abs(Math.sin(t * 6)) * 0.05;
      vung = 0.9 + Math.sin(t * 6) * 0.4;
    } else if (!ngoi) {
      nhun = Math.sin(t * 2) * 0.004;
    }
    if (ngoi) {
      this.than.position.y = -0.27;
      this.chan.rotation.x = -Math.PI / 2 + 0.15;
      this.chan.position.set(0, 0.32, 0.02);
    } else {
      this.than.position.y = nhun;
      this.chan.rotation.x = 0;
      this.chan.position.set(0, 0.3, 0);
    }
    this.than.rotation.z = lac;
    const vui = trangThai === 'emoting' || trangThai === 'playing';
    this.tayTrai.rotation.x = ngoi ? -0.55 : vung;
    this.tayPhai.rotation.x = ngoi ? -0.55 : vui ? vung : -vung;
    if (tayCam === 'left') this.tayTrai.rotation.x = -1.0;
    if (tayCam === 'right') this.tayPhai.rotation.x = -1.0;
    this.dau.rotation.x = dangNoi ? Math.sin(t * 7) * 0.06 : Math.sin(t * 1.3) * 0.03;
    this.dau.rotation.z = Math.sin(t * 0.9) * 0.04;
    if (dangNoi) {
      this.nhipMieng += dt;
      this.mat.map = Math.floor(this.nhipMieng / 0.12) % 2 === 0 ? matMo : matKhep;
    } else {
      this.mat.map = matKhep;
    }
  }

  /** Vị trí THẾ GIỚI của bàn tay (để đồ đang cầm bám theo búp bê, không theo VRM ẩn). */
  viTriTay(tay: 'left' | 'right', ra: THREE.Vector3): THREE.Vector3 {
    const nhom = tay === 'left' ? this.tayTrai : this.tayPhai;
    nhom.updateWorldMatrix(true, false);
    return ra.set(0, -0.22, 0.03).applyMatrix4(nhom.matrixWorld);
  }

  /**
   * Tư thế tĩnh cho nhân viên: `ngoi` (ngồi ghế, tay đặt bàn phím), `dung-noi`
   * (đứng cầm giấy), `bung-coc` (cầm cốc). Gốc của búp bê ngồi = MẶT GHẾ.
   */
  tuThe(kieu: 'ngoi' | 'dung-noi' | 'bung-coc'): void {
    if (kieu === 'ngoi') {
      this.than.position.y = -0.27;
      this.chan.rotation.x = -Math.PI / 2 + 0.15;
      this.chan.position.set(0, 0.32, 0.02);
      this.tayTrai.rotation.x = -1.0;
      this.tayPhai.rotation.x = -1.0;
    } else if (kieu === 'dung-noi') {
      this.tayPhai.rotation.x = -1.2;
      this.tayPhai.add(luoi(new THREE.BoxGeometry(0.12, 0.16, 0.01), std(0xfbf8f2), 0, -0.24, 0.05));
    } else {
      this.tayTrai.rotation.x = -1.3;
      this.tayTrai.add(luoi(new THREE.CylinderGeometry(0.035, 0.03, 0.07, 12), std(0xe8e0d0, 0.4), 0, -0.25, 0.02));
    }
  }
}

/** Trang phục cho từng nhân vật đã biết (Nhi = gen, Nam = owner). */
export const KIEU_NHAN_VAT: Record<string, KieuBupBe> = {
  gen: { ao: 0xf6efe4, duoi: 0x2e3d63, kieuDuoi: 'vay', toc: 'bui', phuKien: 'the-ten', mauPhuKien: 0xe0607e },
  owner: { ao: 0xa9c8e8, duoi: 0x2f3442, kieuDuoi: 'quan', toc: 'ngan', phuKien: 'ca-vat', mauPhuKien: 0x2f4a7a },
};

/** Nhân viên văn phòng — đủ khác nhau để mỗi khu trông như có người thật làm. */
export const NHAN_VIEN: KieuBupBe[] = [
  { ao: 0xffffff, duoi: 0x3b4252, kieuDuoi: 'quan', toc: 'ngan', phuKien: 'kinh' },
  { ao: 0xf2c9c4, duoi: 0x4a4e6a, kieuDuoi: 'vay', toc: 'dai', mauToc: 0x4a3226, phuKien: 'the-ten' },
  { ao: 0xc9dfc4, duoi: 0x5a5a5a, kieuDuoi: 'quan', toc: 'ngan', mauToc: 0x3a2a20, phuKien: 'the-ten', mauPhuKien: 0x3f7cc0 },
  { ao: 0xe9dcf5, duoi: 0x343a52, kieuDuoi: 'vay', toc: 'buoc', phuKien: 'kinh' },
  { ao: 0xfbe6b8, duoi: 0x6b5b4a, kieuDuoi: 'quan', toc: 'ngan', phuKien: 'ca-vat', mauPhuKien: 0x8a2f3a },
  { ao: 0xbfd9ea, duoi: 0x2e3440, kieuDuoi: 'vay', toc: 'bui', mauToc: 0x5a3b2a },
  { ao: 0xf4f4f4, duoi: 0x7a6aa0, kieuDuoi: 'vay', toc: 'dai', phuKien: 'the-ten', mauPhuKien: 0x3f9c6c },
  { ao: 0xd9cbb8, duoi: 0x2b2f38, kieuDuoi: 'quan', toc: 'ngan', mauToc: 0x1a1a1a, phuKien: 'kinh' },
];
/** Bí danh cũ (bản làng) — `world.ts` dùng khi actor không có trang phục riêng. */
export const DAN_LANG = NHAN_VIEN;
