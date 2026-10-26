/**
 * giong.ts — V2: bộ điều khiển giọng nói của extension (thuần, không import `vscode`).
 *
 * Hai cách nói, MỘT lần thu tại một thời điểm:
 *  - `giu()` / `tha()`  — nút 🎤 giữ-để-nói ở chatroom: tai-nghe `--im-lang-ms 0`,
 *    thả nút = dòng `dung` vào stdin.
 *  - `batTat()`         — lệnh `genStage.noi` (phím): lần 1 bắt đầu có VAD
 *    (`--im-lang-ms 1200`), lần 2 dừng. VS Code không có API keyup cho
 *    keybinding nên KHÔNG có "giữ phím".
 * `--to` = nhân vật đang chọn ở chatroom lúc BẮT ĐẦU thu (INT-02).
 *
 * Trạng thái hiển thị nằm trong `SoChatroom.giong` (host là nguồn sự thật);
 * mức âm (`muc`) đi đường riêng `guiMuc` cho nhẹ, không dựng lại cả mô hình.
 */
import { chuBoQua, chuLoi, MA_THOAT_HUY, maLoiTuMaThoat, type CheDoGiong } from './chatroom-logic';
import type { CauHinh } from './cau-hinh';
import type { LenhChay } from './tien-trinh';
import type { SoChatroom } from './so-chatroom';
import { kiemTruocKhiBat, lenhTaiNghe, TienTrinhTaiNghe, type KetThucTaiNghe, type SuTaiNghe } from './tai-nghe';

export type CauHinhGiong = Pick<CauHinh, 'root' | 'pnpm' | 'bridgePort' | 'sttPort' | 'taiNgheNguon'>;

export interface TuyChonGiong {
  so: SoChatroom;
  layCfg: () => CauHinhGiong;
  /** Cổng an toàn chung với bridge/vite/não: workspace trusted + root đã duyệt. null = được. */
  choPhep: () => Promise<string | null>;
  /** Vẽ lại chatroom (mô hình đổi). */
  ve: () => void;
  /** Mức âm 0..1 trong lúc nghe — chỉ cái vạch, không đổi mô hình. */
  guiMuc?: (rms: number) => void;
  ghi: (dong: string) => void;
  /** Test: thay lệnh spawn (mặc định `lenhTaiNghe`). */
  taoLenh?: (cfg: CauHinhGiong, to: string, cheDo: CheDoGiong) => LenhChay;
  hanCungMs?: number;
  hanHuyMs?: number;
}

export class DieuKhienGiong {
  private tt: TienTrinhTaiNghe | null = null;
  private cheDo: CheDoGiong | null = null;
  /** Đang chờ `choPhep` (có thể là hộp thoại modal) — chưa spawn. */
  private dangKhoiDong = false;
  /** Sếp thả nút / bấm phím lần 2 khi còn đang khởi động → không spawn nữa. */
  private thaSom = false;
  /** Đổi mỗi lần bắt đầu/huỷ: callback của lần cũ thấy khác số thì im. */
  private phien = 0;
  /** Lần thu hiện tại đã có kết cục (ket-qua/bo-qua/loi) chưa. */
  private daKetCuc = false;
  /** Tiến trình đã bị huỷ nhưng chưa đóng hẳn (đang chờ `huy` / SIGKILL dự phòng). */
  private dangDong = new Set<TienTrinhTaiNghe>();

  constructor(private o: TuyChonGiong) {}

  /** Đang có một lần thu (kể cả đang khởi động / đang nhận dạng). */
  get dangThu(): boolean {
    return this.dangKhoiDong || this.tt !== null;
  }

  get pidDangChay(): number | undefined {
    return this.tt?.pid;
  }

  giu(): void {
    void this.bat('giu');
  }

  tha(): void {
    if (this.cheDo !== 'giu') return;
    this.dungThu();
  }

  /** Lệnh `genStage.noi`: chưa thu → bắt đầu (VAD); đang thu → dừng. */
  batTat(): void {
    if (this.dangThu) this.dungThu();
    else void this.bat('bat-tat');
  }

  /**
   * Huỷ lần thu đang chạy, bỏ kết quả (đóng chatroom, đổi cấu hình, deactivate…):
   * `huy` vào stdin (không STT, không stage.hear), quá hạn thì SIGKILL cả nhóm.
   * `ngay` = SIGKILL luôn (extension đang tắt). Promise xong khi tiến trình đã đóng.
   */
  huy(lyDo: string, ngay = false): Promise<void> {
    if (!this.dangThu) return Promise.resolve();
    this.o.ghi(`[giọng] huỷ lần thu: ${lyDo}`);
    this.phien++;
    const tt = this.tt;
    this.tt = null;
    this.cheDo = null;
    this.dangKhoiDong = false;
    this.o.so.giongNghi(`Đã huỷ lần thu (${lyDo}).`);
    this.o.ve();
    if (!tt) return Promise.resolve();
    this.dangDong.add(tt);
    return tt.huy(ngay).then(() => {
      this.dangDong.delete(tt);
    });
  }

  /** Extension sắp tắt: SIGKILL ngay mọi nhóm tai-nghe còn sống (kể cả đang chờ `huy`). */
  epTat(): void {
    if (this.tt) void this.huy('extension tắt', true);
    for (const tt of this.dangDong) void tt.huy(true);
  }

  /** Còn tiến trình tai-nghe nào chưa đóng hẳn không (test/nhật ký). */
  get conTienTrinh(): boolean {
    return this.tt !== null || this.dangDong.size > 0;
  }

  /**
   * Chatroom bị ẩn giữa lúc GIỮ nút: document webview bị huỷ nên `pointerup` không
   * bao giờ tới — huỷ luôn thay vì để tai-nghe thu tới `--toi-da-ms`. Lần thu bằng
   * phím (bật/tắt) không phụ thuộc chatroom nên giữ nguyên.
   */
  huyNeuGiu(lyDo: string): void {
    if (this.cheDo === 'giu') void this.huy(lyDo);
  }

  private dungThu(): void {
    if (this.dangKhoiDong) {
      this.thaSom = true;
      return;
    }
    this.tt?.dung();
  }

  private loi(chu: string, goiY = ''): void {
    this.o.so.datGiong({ pha: 'loi', chu, goiY, cau: null });
    this.o.ve();
  }

  private async bat(cheDo: CheDoGiong): Promise<void> {
    if (this.dangThu) return; // một lần thu tại một thời điểm
    const so = this.o.so;
    const to = so.nguoiNghe;
    if (!so.bridgeNoi) return this.loi('Chưa nối bridge — không gửi được câu nói.', 'Chạy "Gen-Stage: Bật bridge + sân khấu" hoặc `pnpm bridge`.');
    if (!to) return this.loi('Chưa có nhân vật nào để nghe.', 'Mở sân khấu để chatroom lấy danh sách nhân vật.');
    const dangNoi = so.agentDangNoi();
    if (dangNoi.length) {
      // bán song công phía UI (nút 🎤 đã tắt; đây là đường phím)
      so.datGiong({ pha: 'bo-qua', cheDo, toi: to, chu: chuBoQua('gen-dang-noi'), goiY: '', cau: null });
      this.o.ve();
      return;
    }
    const phien = ++this.phien;
    this.cheDo = cheDo;
    this.dangKhoiDong = true;
    this.thaSom = false;
    this.daKetCuc = false;
    so.datGiong({ pha: 'khoi-dong', cheDo, toi: to, chu: 'Đang mở micro…', goiY: '', cau: null });
    this.o.ve();

    let lyDo: string | null;
    try {
      lyDo = await this.o.choPhep();
    } catch (e) {
      lyDo = (e as Error).message;
    }
    if (phien !== this.phien) return; // bị huỷ trong lúc chờ
    this.dangKhoiDong = false;
    if (lyDo) {
      this.cheDo = null;
      return this.loi(lyDo);
    }
    if (this.thaSom) {
      this.cheDo = null;
      so.giongNghi('Thả nút trước khi micro kịp mở — chưa thu gì.');
      this.o.ve();
      return;
    }
    const cfg = this.o.layCfg();
    const kiem = kiemTruocKhiBat(cfg);
    if (!kiem.ok) {
      this.cheDo = null;
      return this.loi(kiem.loi);
    }
    const l = (this.o.taoLenh ?? lenhTaiNghe)(cfg, to, cheDo);
    l.cmd = kiem.cmd;
    this.o.ghi(`[giọng] bật tai-nghe (${cheDo}): ${l.cmd} ${l.args.join(' ')}`);
    try {
      this.tt = new TienTrinhTaiNghe(l, cfg.root, {
        khiSu: (s) => {
          if (phien === this.phien) this.nhanSu(s, to);
        },
        khiXong: (k) => {
          if (phien === this.phien) this.ketThuc(k, cfg);
        },
        ghi: this.o.ghi,
        ...(this.o.hanCungMs !== undefined ? { hanCungMs: this.o.hanCungMs } : {}),
        ...(this.o.hanHuyMs !== undefined ? { hanHuyMs: this.o.hanHuyMs } : {}),
      });
    } catch (e) {
      this.cheDo = null;
      return this.loi(`Không bật được tai-nghe: ${(e as Error).message}`, 'Kiểm genStage.pnpm / PATH.');
    }
    this.o.ghi(`[giọng] tai-nghe pid/pgid ${this.tt.pid ?? '-'} · --to ${to}`);
  }

  private nhanSu(s: SuTaiNghe, to: string): void {
    const so = this.o.so;
    switch (s.su) {
      case 'bat-dau':
        so.datGiong({
          pha: 'nghe',
          chu: this.cheDo === 'giu' ? 'Đang nghe… (thả nút để gửi)' : 'Đang nghe… (im 1,2 s hoặc bấm lại phím để dừng)',
        });
        break;
      case 'muc':
        this.o.guiMuc?.(s.rms);
        return;
      case 'dang-nhan-dang':
        so.datGiong({ pha: 'nhan-dang', chu: 'Đang nhận dạng…' });
        break;
      case 'ket-qua':
        this.daKetCuc = true;
        if (!s.text.trim()) {
          so.datGiong({ pha: 'bo-qua', chu: chuBoQua('rong'), goiY: '' });
        } else if (s.daGui) {
          // câu sẽ hiện trong log qua user.text/user.speech của sân khấu (một nguồn)
          this.o.ghi(`[giọng] đã gửi stage.hear (tin cậy ${s.confidence.toFixed(2)}) → ${to}: ${s.text}`);
          so.giongNghi();
        } else {
          this.o.ghi(`[giọng] tin cậy ${s.confidence.toFixed(2)} < 0,6 — chờ Sếp xác nhận: ${s.text}`);
          so.datGiong({
            pha: 'cho-xac-nhan',
            chu: `Nghe chưa chắc (tin cậy ${Math.round(s.confidence * 100)} %) — sửa rồi Gửi, hoặc Bỏ.`,
            goiY: '',
            cau: { id: 0, text: s.text, confidence: s.confidence, durationMs: s.durationMs, to },
          });
        }
        break;
      case 'bo-qua':
        this.daKetCuc = true;
        so.datGiong({ pha: 'bo-qua', chu: chuBoQua(s.lyDo), goiY: '' });
        break;
      case 'loi': {
        this.daKetCuc = true;
        const c = this.o.layCfg();
        const l = chuLoi(s.ma, s.chu, c);
        this.o.ghi(`[giọng] lỗi tai-nghe ${s.ma}: ${s.chu}`);
        if (so.giong.pha === 'cho-xac-nhan' && so.giong.cau) {
          // hợp đồng: `stage.hear` hỏng ⇒ `ket-qua daGui:false` (giữ chữ) RỒI `loi bridge` —
          // giữ câu trong ô xác nhận để Sếp bấm Gửi lại qua ws của extension
          so.datGiong({ chu: `Chưa gửi được (${l.chu}) — kiểm rồi bấm Gửi lại, hoặc Bỏ.`, goiY: l.goiY });
        } else {
          so.datGiong({ pha: 'loi', chu: l.chu, goiY: l.goiY, cau: null });
        }
        break;
      }
    }
    this.o.ve();
  }

  private ketThuc(k: KetThucTaiNghe, cfg: CauHinhGiong): void {
    this.tt = null;
    this.cheDo = null;
    this.o.ghi(`[giọng] tai-nghe thoát (mã ${k.ma ?? '-'}${k.tin ? ' · ' + k.tin : ''})`);
    if (this.daKetCuc) return;
    // thoát mà không in kết cục nào → suy từ mã thoát / lỗi spawn
    if (k.loiSpawn) {
      this.loi(`Không bật được tai-nghe: ${k.loiSpawn}`, 'Kiểm genStage.pnpm / PATH.');
      return;
    }
    if (k.ma === MA_THOAT_HUY) {
      this.o.so.giongNghi('Đã huỷ lần thu.');
      this.o.ve();
      return;
    }
    if (k.ma === 0) {
      this.o.so.giongNghi('Đã dừng — không có câu nào.');
      this.o.ve();
      return;
    }
    const l = chuLoi(maLoiTuMaThoat(k.ma), k.stderr || (k.tin ? `bị dừng bằng ${k.tin}` : `mã thoát ${k.ma ?? '-'}`), cfg);
    this.loi(l.chu, l.goiY);
  }
}
