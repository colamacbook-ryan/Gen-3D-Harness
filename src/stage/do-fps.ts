/**
 * do-fps.ts — đo FPS để tự tắt/bật bloom (spec mục 5), THUẦN (không three, không DOM).
 *
 * Bản cũ lấy `1 / dt` với `dt` đã kẹp ≤ 1/20 s → mọi khung đều báo ≥ 20 fps, máy
 * 2–4 fps phải chờ 10–20 s mới tụt dưới ngưỡng. Nay đo bằng KHOẢNG CÁCH THẬT giữa
 * hai khung (mốc đồng hồ thật, ms), không kẹp.
 */

/** FPS dưới mức này liên tục quá `HAN_FPS_THAP_MS` thì tắt bloom. */
export const FPS_TU_TAT_BLOOM = 24;
/** Phải vượt `FPS_TU_TAT_BLOOM + LE_BAT_LAI` mới bật lại (tránh nhấp nháy quanh ngưỡng). */
export const LE_BAT_LAI_FPS = 8;
/** Thời gian FPS thấp liên tục (ms) trước khi tắt bloom. */
export const HAN_FPS_THAP_MS = 2000;

export type QuyetDinhBloom = 'tat' | 'bat' | null;

export class DoFps {
  private lanTruoc: number | null = null;
  private thapTuMs = 0;

  /**
   * Gọi mỗi khung VẼ với mốc đồng hồ thật `bayGioMs`. Chế độ nền thì không đo
   * (15 fps là cố ý) và bỏ mốc cũ để khung đầu sau nền không bị tính là "chậm".
   */
  capNhat(bayGioMs: number, nen: boolean): QuyetDinhBloom {
    if (nen) {
      this.datLai();
      return null;
    }
    const truoc = this.lanTruoc;
    this.lanTruoc = bayGioMs;
    if (truoc === null) return null; // khung đầu: chưa có khoảng nào để đo
    const khoang = bayGioMs - truoc;
    if (!(khoang > 0)) return null;
    const fps = 1000 / khoang;
    if (fps < FPS_TU_TAT_BLOOM) {
      this.thapTuMs += khoang;
      return this.thapTuMs > HAN_FPS_THAP_MS ? 'tat' : null;
    }
    this.thapTuMs = 0;
    return fps > FPS_TU_TAT_BLOOM + LE_BAT_LAI_FPS ? 'bat' : null;
  }

  /** Quên mốc + bộ đếm (vào/ra nền). */
  datLai(): void {
    this.lanTruoc = null;
    this.thapTuMs = 0;
  }
}
