/**
 * NHÂN VẬT BÚP BÊ HANBOK — bản thử theo ảnh làng của Ryan (27/10).
 *
 * Ảnh mẫu không dùng nhân vật anime: đó là búp bê đồ chơi — đầu tròn to (~40 %
 * chiều cao), mặt vẽ chấm, áo jeogori ngắn, váy chima hình chuông (nữ) hoặc
 * quần baji phồng (nam), khăn trắng hoặc búi tóc.
 *
 * Búp bê chỉ là LỚP HÌNH. Bộ não hành động (đi, quay, nói, hàng đợi lệnh…)
 * vẫn là `NhanVat` với VRM ẩn bên dưới — nên Actor API, bridge, MCP không đổi
 * gì. `World` chép vị trí + hướng của nhân vật sang búp bê mỗi khung, búp bê tự
 * diễn nhún/vung tay/nhép miệng theo `state`.
 *
 * Rẻ: ~16 mesh, vài trăm tam giác, không skinning, không morph — so với một
 * VRM ~80 lượt vẽ và hàng chục nghìn tam giác.
 */
import * as THREE from 'three';

export interface KieuBupBe {
  /** Màu áo jeogori. */
  ao: number;
  /** Màu váy chima (nữ) / quần baji (nam). */
  duoi: number;
  /** `vay` = chima hình chuông; `quan` = baji phồng. */
  kieuDuoi: 'vay' | 'quan';
  /** Kiểu đầu: búi tóc sau gáy · khăn trắng quấn trán · tóc ngắn búi đỉnh (nam). */
  toc: 'bui' | 'khan' | 'chop';
  /** Màu dây nơ áo (goreum). */
  no?: number;
  /** Cỡ tổng (1 = cao ~1,0 m). */
  co?: number;
}

const DA = 0xf2d0b0;
const TOC = 0x1d1a1c;

/** Mặt vẽ: hai chấm mắt, má hồng, miệng (khép / mở). */
function veMat(mo: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1c1414';
  for (const x of [42, 86]) {
    g.beginPath();
    g.ellipse(x, 60, 6, 8, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(240,120,120,0.45)';
  for (const x of [30, 98]) {
    g.beginPath();
    g.ellipse(x, 80, 11, 7, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#7a3030';
  g.lineWidth = 4;
  g.lineCap = 'round';
  if (mo) {
    g.fillStyle = '#9a3a3a';
    g.beginPath();
    g.ellipse(64, 86, 8, 7, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    g.beginPath();
    g.arc(64, 80, 9, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let matKhep: THREE.CanvasTexture | null = null;
let matMo: THREE.CanvasTexture | null = null;

function std(color: number, roughness = 0.75): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function luoi(geo: THREE.BufferGeometry, vl: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, vl);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Một búp bê. `goc` đặt vào cảnh; `diễn()` gọi mỗi khung. */
export class BupBe {
  readonly goc = new THREE.Group();
  private than = new THREE.Group();
  private dau = new THREE.Group();
  private tayTrai = new THREE.Group();
  private tayPhai = new THREE.Group();
  private mat: THREE.MeshBasicMaterial;
  private t = Math.random() * 10;
  private nhipMieng = 0;

  constructor(k: KieuBupBe) {
    matKhep ??= veMat(false);
    matMo ??= veMat(true);
    const co = k.co ?? 1;
    const vlAo = std(k.ao);
    const vlDuoi = std(k.duoi);
    const vlDa = std(DA, 0.6);
    const vlToc = std(TOC, 0.45);
    const vlCo = std(0xfaf6ee);

    // ---- phần dưới ----
    if (k.kieuDuoi === 'vay') {
      const p = [
        [0, 0.02],
        [0.27, 0.02],
        [0.25, 0.12],
        [0.2, 0.3],
        [0.15, 0.44],
        [0, 0.44],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      this.than.add(luoi(new THREE.LatheGeometry(p, 18), vlDuoi));
    } else {
      for (const dau of [1, -1]) {
        const ong = luoi(new THREE.CapsuleGeometry(0.085, 0.2, 4, 10), vlDuoi, dau * 0.08, 0.2, 0);
        this.than.add(ong);
      }
      this.than.add(luoi(new THREE.CylinderGeometry(0.15, 0.16, 0.12, 14), vlDuoi, 0, 0.38, 0));
    }
    // giày
    for (const dau of [1, -1]) {
      const g = luoi(new THREE.SphereGeometry(0.055, 10, 6), std(0x2a2226), dau * 0.08, 0.03, 0.06);
      g.scale.set(1, 0.6, 1.6);
      this.than.add(g);
    }
    // ---- áo jeogori ----
    const ao = luoi(new THREE.CylinderGeometry(0.12, 0.155, 0.22, 14), vlAo, 0, 0.53, 0);
    this.than.add(ao);
    // cổ áo trắng chéo + nơ
    const coAo = luoi(new THREE.BoxGeometry(0.035, 0.18, 0.02), vlCo, 0.02, 0.56, 0.135);
    coAo.rotation.z = 0.55;
    this.than.add(coAo);
    const no = luoi(new THREE.BoxGeometry(0.05, 0.13, 0.02), std(k.no ?? 0xc0394b), 0.045, 0.5, 0.14);
    no.rotation.z = -0.15;
    this.than.add(no);

    // ---- tay (khớp ở vai để vung) ----
    for (const [nhom, dau] of [
      [this.tayTrai, 1],
      [this.tayPhai, -1],
    ] as const) {
      nhom.position.set(dau * 0.15, 0.62, 0);
      const ong = luoi(new THREE.CapsuleGeometry(0.05, 0.16, 4, 8), vlAo, 0, -0.11, 0);
      nhom.add(ong);
      nhom.add(luoi(new THREE.SphereGeometry(0.038, 8, 6), vlDa, 0, -0.23, 0));
      nhom.rotation.z = dau * 0.18;
      this.than.add(nhom);
    }

    // ---- đầu ----
    this.dau.position.set(0, 0.84, 0);
    this.dau.add(luoi(new THREE.SphereGeometry(0.2, 22, 16), vlDa));
    this.mat = new THREE.MeshBasicMaterial({ map: matKhep, transparent: true, depthWrite: false });
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), this.mat);
    mat.position.set(0, -0.02, 0.196);
    mat.castShadow = false;
    this.dau.add(mat);
    // tóc: mũ chụp nửa sau + mái
    const mu = luoi(new THREE.SphereGeometry(0.212, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), vlToc);
    mu.rotation.x = -0.32;
    this.dau.add(mu);
    const gay = luoi(new THREE.SphereGeometry(0.205, 18, 12, Math.PI * 0.25, Math.PI * 0.5, 0.3, Math.PI * 0.55), vlToc);
    gay.rotation.y = Math.PI;
    this.dau.add(gay);
    if (k.toc === 'bui') {
      this.dau.add(luoi(new THREE.SphereGeometry(0.085, 12, 10), vlToc, 0, -0.08, -0.2));
      this.dau.add(luoi(new THREE.BoxGeometry(0.16, 0.025, 0.025), std(0xd94f7a), 0, -0.08, -0.25));
    } else if (k.toc === 'khan') {
      const khan = luoi(new THREE.TorusGeometry(0.2, 0.035, 8, 24), vlCo, 0, 0.06, 0);
      khan.rotation.x = Math.PI / 2 + 0.25;
      this.dau.add(khan);
      this.dau.add(luoi(new THREE.SphereGeometry(0.07, 10, 8), vlToc, 0, -0.07, -0.19));
    } else {
      this.dau.add(luoi(new THREE.SphereGeometry(0.06, 10, 8), vlToc, 0, 0.2, -0.04));
    }
    this.than.add(this.dau);

    this.goc.add(this.than);
    this.goc.scale.setScalar(co);
  }

  /**
   * Diễn một khung theo trạng thái của nhân vật: đi = nhún + lắc + vung tay;
   * nói = gật nhẹ + nhép miệng; đứng = thở; cúi = ngồi xổm làm vườn.
   */
  dien(dt: number, trangThai: string, dangNoi: boolean): void {
    this.t += dt;
    const t = this.t;
    let nhun = 0;
    let lac = 0;
    let vung = 0;
    if (trangThai === 'walking') {
      nhun = Math.abs(Math.sin(t * 9)) * 0.045;
      lac = Math.sin(t * 9) * 0.07;
      vung = Math.sin(t * 9) * 0.6;
    } else if (trangThai === 'emoting' || trangThai === 'playing') {
      nhun = Math.abs(Math.sin(t * 6)) * 0.06;
      vung = 0.9 + Math.sin(t * 6) * 0.4;
    } else {
      nhun = Math.sin(t * 2) * 0.004;
    }
    this.than.position.y = nhun;
    this.than.rotation.z = lac;
    this.tayTrai.rotation.x = vung;
    this.tayPhai.rotation.x = trangThai === 'emoting' || trangThai === 'playing' ? -vung : -vung;
    this.dau.rotation.x = dangNoi ? Math.sin(t * 7) * 0.06 : Math.sin(t * 1.3) * 0.03;
    this.dau.rotation.z = Math.sin(t * 0.9) * 0.04;
    if (dangNoi) {
      this.nhipMieng += dt;
      const mo = Math.floor(this.nhipMieng / 0.12) % 2 === 0;
      this.mat.map = mo ? matMo : matKhep;
    } else {
      this.mat.map = matKhep;
    }
  }

  /** Tư thế tĩnh cho dân làng trang trí: ngồi xổm nhổ cỏ / bưng rổ. */
  tuThe(kieu: 'xom' | 'bung-ro'): void {
    if (kieu === 'xom') {
      this.than.scale.set(1, 0.82, 1);
      this.than.rotation.x = 0.35;
      this.tayTrai.rotation.x = -1.1;
      this.tayPhai.rotation.x = -0.9;
    } else {
      this.tayTrai.rotation.x = -1.2;
      this.tayPhai.rotation.x = -1.2;
      const ro = luoi(new THREE.BoxGeometry(0.26, 0.09, 0.16), std(0x9c6b3c), 0, 0.5, 0.2);
      this.than.add(ro);
    }
  }
}

/** Trang phục cho từng nhân vật đã biết (Nhi = gen, Nam = owner) + dân làng. */
export const KIEU_NHAN_VAT: Record<string, KieuBupBe> = {
  gen: { ao: 0xbfe3cf, duoi: 0x3d4f8f, kieuDuoi: 'vay', toc: 'bui', no: 0xd94f7a },
  owner: { ao: 0xf2ece0, duoi: 0x7a6aa8, kieuDuoi: 'quan', toc: 'chop', no: 0x3d4f8f },
};

export const DAN_LANG: KieuBupBe[] = [
  { ao: 0xc8e6d0, duoi: 0x3a4f8a, kieuDuoi: 'vay', toc: 'khan', no: 0xc0394b },
  { ao: 0xe7dcf2, duoi: 0x8a6bc4, kieuDuoi: 'quan', toc: 'chop', co: 0.85 },
  { ao: 0xf4e9f0, duoi: 0x7d63b8, kieuDuoi: 'quan', toc: 'bui', co: 0.82 },
  { ao: 0xd9ecd6, duoi: 0x4b5f45, kieuDuoi: 'quan', toc: 'chop', co: 0.9 },
];
