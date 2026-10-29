/**
 * Ryan 27/10: "sao mắt mũi miệng nhân vật đâu hết rồi" — mảng MẶT của búp bê
 * từng nằm lệch 90° ở má trái (xoay −π/2 thừa), tóc gáy thêm sau đè lên là mất
 * hẳn. Giao kèo đo bằng hình học thật của `BupBe`:
 *  1. mảng mặt (vật liệu có map) nằm CHÍNH DIỆN (+Z), cùng phía mái tóc + cà vạt,
 *     và NHÔ RA NGOÀI mặt sọ (bản đầu lọt trong sọ 6 mm — sọ che mất mặt);
 *  2. không mảng tóc nào (trừ mái, cao trên trán) có tâm ở nửa trước đầu;
 *  3. tóc gáy ở SAU đầu (−Z) — trước/sau phân biệt được.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';

beforeAll(() => {
  // canvas tối thiểu: `veMat` vẽ mặt lên canvas 2D — ở đây chỉ cần không nổ
  // mọi phương thức trả về chính một "ngữ cảnh rỗng" (gradient.addColorStop… cũng gọi được)
  const rong: object = new Proxy(function () {}, { get: () => rong, apply: () => rong, set: () => true });
  const ctx = rong;
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
});

const tam = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());

describe('búp bê — mặt ở chính diện, tóc không che mặt', () => {
  it('mảng mặt +Z, giữa đầu; tóc chỉ ở sau / trên; gáy ở −Z', async () => {
    const { BupBe, KIEU_NHAN_VAT, NHAN_VIEN } = await import('../../stage/bup-be');
    for (const kieu of [KIEU_NHAN_VAT.gen!, KIEU_NHAN_VAT.owner!, ...NHAN_VIEN]) {
      const bb = new BupBe(kieu);
      bb.goc.updateMatrixWorld(true);
      const dau: { mesh: THREE.Mesh; c: THREE.Vector3 }[] = [];
      bb.goc.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && tam(m).y > 0.7) dau.push({ mesh: m, c: tam(m) });
      });
      const mat = dau.find((d) => (d.mesh.material as THREE.MeshBasicMaterial).map);
      expect(mat, 'có mảng mặt').toBeTruthy();
      expect(mat!.c.z, 'mặt phải ở phía trước (+Z)').toBeGreaterThan(0.1);
      expect(Math.abs(mat!.c.x), 'mặt phải ở giữa, không lệch sang má').toBeLessThan(0.03);
      // sọ = khối cầu da lớn nhất ở tâm đầu; mặt phải nhô ra ngoài nó
      const so = dau
        .filter((d) => d.mesh.geometry.type === 'SphereGeometry' && Math.abs(d.c.x) < 0.01 && Math.abs(d.c.z) < 0.01 && d.mesh !== mat!.mesh)
        .map((d) => new THREE.Box3().setFromObject(d.mesh))
        .sort((a, b) => b.max.z - a.max.z)[0]!;
      const hopMat = new THREE.Box3().setFromObject(mat!.mesh);
      expect(hopMat.max.z, 'mặt phải nhô ra NGOÀI sọ (không bị sọ che)').toBeGreaterThan(so.max.z + 0.001);
      // tóc = mọi mảnh dùng CHUNG vật liệu với mái tóc (khối nhộng trên trán, phía trước)
      const mai = dau.find((d) => d.mesh.geometry.type === 'CapsuleGeometry' && d.c.z > 0.1 && d.c.y > 0.95);
      expect(mai, 'có mái tóc').toBeTruthy();
      const toc = dau.filter((d) => d.mesh.material === mai!.mesh.material);
      expect(toc.length).toBeGreaterThan(2);
      for (const t of toc) {
        const laMai = t.c.y > 0.95; // mái + chỏm: cao trên trán
        if (!laMai) expect(t.c.z, `tóc ở (${t.c.x.toFixed(2)}, ${t.c.y.toFixed(2)}, ${t.c.z.toFixed(2)}) che mặt`).toBeLessThan(0.02);
      }
      expect(toc.some((t) => t.c.z < -0.08 && t.c.y < 0.95), 'có tóc gáy phía sau').toBe(true);
    }
  });
});
