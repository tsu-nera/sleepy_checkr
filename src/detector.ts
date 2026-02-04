import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Keypoint } from './fatigue-detector';

export interface Point {
  x: number;
  y: number;
}

export interface DetectionResult {
  irisCenter: Point | null;
  faceDetected: boolean;
  keypoints: Keypoint[] | null;
}

export class FaceDetector {
  private faceLandmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;

  async initialize(): Promise<void> {
    console.log('Initializing face detector with MediaPipe Tasks Vision...');

    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });

    console.log('Face detector initialized successfully');
  }

  async detect(video: HTMLVideoElement): Promise<DetectionResult> {
    if (!this.faceLandmarker) {
      throw new Error('Detector not initialized');
    }

    if (video.readyState !== 4 || video.videoWidth === 0) {
      return { irisCenter: null, faceDetected: false, keypoints: null };
    }

    // 同じフレームを処理しないようにする
    const currentTime = video.currentTime;
    if (currentTime === this.lastVideoTime) {
      return { irisCenter: null, faceDetected: false, keypoints: null };
    }
    this.lastVideoTime = currentTime;

    const result = this.faceLandmarker.detectForVideo(video, performance.now());

    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return { irisCenter: null, faceDetected: false, keypoints: null };
    }

    console.log('Detected faces:', result.faceLandmarks.length);

    // MediaPipe Tasks VisionのランドマークをKeypoint形式に変換
    const landmarks = result.faceLandmarks[0];
    const keypoints: Keypoint[] = landmarks.map((landmark) => ({
      x: landmark.x * video.videoWidth,
      y: landmark.y * video.videoHeight,
      z: landmark.z,
    }));

    console.log('Total keypoints:', keypoints.length);

    // 虹彩のランドマーク: 468-477
    // 左虹彩: 468-472 (5点)
    // 右虹彩: 473-477 (5点)
    let irisCenter: Point | null = null;
    if (keypoints.length > 477) {
      const leftIris = keypoints.slice(468, 473);
      const rightIris = keypoints.slice(473, 478);
      const allIrisPoints = [...leftIris, ...rightIris];
      irisCenter = this.calculateCenter(allIrisPoints);
      console.log('Iris center:', irisCenter);
    }

    return {
      irisCenter,
      faceDetected: true,
      keypoints,
    };
  }

  private calculateCenter(points: Keypoint[]): Point {
    const sum = points.reduce(
      (acc, point) => ({
        x: acc.x + point.x,
        y: acc.y + point.y,
      }),
      { x: 0, y: 0 }
    );

    return {
      x: sum.x / points.length,
      y: sum.y / points.length,
    };
  }
}
