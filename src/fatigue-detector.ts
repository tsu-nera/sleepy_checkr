import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';

export interface FatigueScore {
  score: number; // 0-100
  level: string; // 正常/やや疲労/疲労
  details: string; // アルゴリズム固有の詳細情報
}

/**
 * 疲労検出アルゴリズムの共通インターフェース
 */
export interface FatigueDetector {
  /**
   * キーポイントを受け取って内部状態を更新
   */
  update(keypoints: faceLandmarksDetection.Keypoint[]): void;

  /**
   * 現在の疲労スコアを計算して返す
   */
  getScore(): FatigueScore;

  /**
   * アルゴリズムの名前を返す
   */
  getName(): string;
}

/**
 * 目のランドマークインデックス（MediaPipe FaceMesh）
 */
export const EYE_LANDMARKS = {
  LEFT: {
    p1: 33,  // 左端
    p2: 160, // 上1
    p3: 158, // 上2
    p4: 133, // 右端
    p5: 153, // 下2
    p6: 144, // 下1
  },
  RIGHT: {
    p1: 362, // 左端
    p2: 385, // 上1
    p3: 387, // 上2
    p4: 263, // 右端
    p5: 373, // 下2
    p6: 380, // 下1
  },
} as const;

/**
 * Eye Aspect Ratio (EAR) を計算
 */
export function calculateEAR(
  keypoints: faceLandmarksDetection.Keypoint[],
  indices: { p1: number; p2: number; p3: number; p4: number; p5: number; p6: number }
): number {
  const p1 = keypoints[indices.p1];
  const p2 = keypoints[indices.p2];
  const p3 = keypoints[indices.p3];
  const p4 = keypoints[indices.p4];
  const p5 = keypoints[indices.p5];
  const p6 = keypoints[indices.p6];

  // 垂直距離
  const vertical1 = distance(p2, p6);
  const vertical2 = distance(p3, p5);

  // 水平距離
  const horizontal = distance(p1, p4);

  // EAR = (vertical1 + vertical2) / (2 * horizontal)
  return (vertical1 + vertical2) / (2 * horizontal);
}

/**
 * 2点間の距離を計算
 */
export function distance(
  p1: faceLandmarksDetection.Keypoint,
  p2: faceLandmarksDetection.Keypoint
): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}
