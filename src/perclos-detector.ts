import {
  Keypoint,
  FatigueDetector,
  FatigueScore,
  EYE_LANDMARKS,
  calculateEAR,
} from './fatigue-detector';

interface EARRecord {
  timestamp: number;
  ear: number;
}

/**
 * PERCLOS (Percentage of Eye Closure) ベースの疲労検出
 *
 * アルゴリズム:
 * - 一定期間内で目が閉じている時間の割合を計測
 * - PERCLOS = (閉眼時間 / 測定時間) × 100
 * - 基準:
 *   - PERCLOS < 15%: 正常
 *   - 15% ≤ PERCLOS < 20%: やや疲労
 *   - PERCLOS ≥ 20%: 疲労
 *
 * 参考: 米国運輸省などで採用されている標準指標
 */
export class PERCLOSDetector implements FatigueDetector {
  private earHistory: EARRecord[] = [];
  private readonly WINDOW_MS = 60000; // 1分間
  private readonly EAR_THRESHOLD = 0.2; // 目が閉じていると判定する閾値（80%閉眼に相当）
  private readonly NORMAL_PERCLOS = 15; // 正常範囲の上限 (%)
  private readonly FATIGUE_PERCLOS = 20; // 疲労の境界 (%)
  private startTime = Date.now(); // 起動時刻を記録
  private lastUpdateTime = Date.now(); // 前回の更新時刻

  getName(): string {
    return 'PERCLOS';
  }

  update(keypoints: Keypoint[]): void {
    const leftEAR = calculateEAR(keypoints, EYE_LANDMARKS.LEFT);
    const rightEAR = calculateEAR(keypoints, EYE_LANDMARKS.RIGHT);

    // 両目の平均EAR
    const avgEAR = (leftEAR + rightEAR) / 2;

    const now = Date.now();

    // EARの履歴を記録
    this.earHistory.push({
      timestamp: now,
      ear: avgEAR,
    });

    this.lastUpdateTime = now;

    console.log('EAR:', avgEAR.toFixed(3), 'Threshold:', this.EAR_THRESHOLD);

    // 古いデータをクリーンアップ
    this.cleanOldData();
  }

  getScore(): FatigueScore {
    const perclos = this.calculatePERCLOS();
    console.log('PERCLOS:', perclos.toFixed(1) + '%');

    let score = 100;
    let level = '正常';

    if (perclos >= this.FATIGUE_PERCLOS) {
      // 20%以上 → 疲労
      level = '疲労';
      // PERCLOS 20% = score 60, 30% = score 30, 40%以上 = score 0
      score = Math.max(0, 100 - (perclos - this.FATIGUE_PERCLOS) * 4);
    } else if (perclos >= this.NORMAL_PERCLOS) {
      // 15-20% → やや疲労
      level = 'やや疲労';
      // PERCLOS 15% = score 80, 20% = score 60
      score = 100 - (perclos - this.NORMAL_PERCLOS) * 4;
    } else {
      // 15%未満 → 正常
      level = '正常';
      // PERCLOS 0% = score 100, 15% = score 80
      score = 100 - perclos * (20 / 15);
    }

    return {
      score: Math.round(score),
      level,
      details: `PERCLOS ${Math.round(perclos * 10) / 10}%`,
    };
  }

  private calculatePERCLOS(): number {
    const recentEARs = this.getRecentEARs();

    if (recentEARs.length === 0) {
      return 0;
    }

    const now = Date.now();

    // 測定期間の計算
    // 起動からの経過時間と WINDOW_MS の小さい方を使う
    const elapsedMs = now - this.startTime;
    const actualWindowMs = Math.min(elapsedMs, this.WINDOW_MS);

    // データが不足している場合（30秒未満）
    if (actualWindowMs < 30000) {
      // 精度が低いが、現在のデータで計算
      return this.calculateClosurePercentage(recentEARs, actualWindowMs);
    }

    // 十分なデータがある場合
    return this.calculateClosurePercentage(recentEARs, actualWindowMs);
  }

  private calculateClosurePercentage(earRecords: EARRecord[], windowMs: number): number {
    if (earRecords.length === 0) return 0;

    // フレーム間の時間を考慮して閉眼時間を計算
    let closedTimeMs = 0;

    for (let i = 0; i < earRecords.length; i++) {
      const record = earRecords[i];

      // 次のフレームまでの時間を計算
      let frameDuration: number;
      if (i < earRecords.length - 1) {
        // 次のフレームとの差分
        frameDuration = earRecords[i + 1].timestamp - record.timestamp;
      } else {
        // 最後のフレームの場合は、前のフレームとの差分を使用
        // または標準的なフレーム時間（33ms ≈ 30fps）を使用
        if (i > 0) {
          frameDuration = record.timestamp - earRecords[i - 1].timestamp;
        } else {
          frameDuration = 33; // デフォルト: 30fps
        }
      }

      // 目が閉じている場合（EAR < 閾値）
      if (record.ear < this.EAR_THRESHOLD) {
        closedTimeMs += frameDuration;
      }
    }

    // PERCLOS = (閉眼時間 / 測定時間) × 100
    const perclos = (closedTimeMs / windowMs) * 100;

    return perclos;
  }

  private getRecentEARs(): EARRecord[] {
    const cutoff = Date.now() - this.WINDOW_MS;
    return this.earHistory.filter((record) => record.timestamp > cutoff);
  }

  private cleanOldData(): void {
    const cutoff = Date.now() - this.WINDOW_MS * 2;
    this.earHistory = this.earHistory.filter((record) => record.timestamp > cutoff);
  }
}
