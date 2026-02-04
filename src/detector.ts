import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';

export interface Point {
  x: number;
  y: number;
}

export interface DetectionResult {
  irisCenter: Point | null;
  faceDetected: boolean;
  keypoints: faceLandmarksDetection.Keypoint[] | null;
}

export class FaceDetector {
  private detector: faceLandmarksDetection.FaceLandmarksDetector | null = null;

  async initialize(): Promise<void> {
    console.log('Initializing face detector...');

    // WebGLバックエンドを明示的に初期化
    await tf.setBackend('webgl');
    await tf.ready();
    console.log('TensorFlow.js backend ready:', tf.getBackend());

    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    const detectorConfig: faceLandmarksDetection.MediaPipeFaceMeshMediaPipeModelConfig = {
      runtime: 'mediapipe',
      solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619',
      refineLandmarks: true, // 虹彩検出を有効化
      maxFaces: 1,
    };

    console.log('Creating face detector with config:', detectorConfig);
    this.detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
    console.log('Face detector initialized successfully');
  }

  async detect(video: HTMLVideoElement): Promise<DetectionResult> {
    if (!this.detector) {
      throw new Error('Detector not initialized');
    }

    // デバッグ: video要素の状態
    console.log('Video readyState:', video.readyState);
    console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight);

    const faces = await this.detector.estimateFaces(video, {
      flipHorizontal: false,
    });

    console.log('Detected faces:', faces.length);

    if (faces.length === 0) {
      return { irisCenter: null, faceDetected: false, keypoints: null };
    }

    const face = faces[0];
    const keypoints = face.keypoints;

    console.log('Total keypoints:', keypoints.length);
    console.log('Keypoint 468:', keypoints[468]);
    console.log('Keypoint 477:', keypoints[477]);

    // 虹彩のランドマーク: 468-477
    // 左虹彩: 468-472 (5点)
    // 右虹彩: 473-477 (5点)
    const leftIris = keypoints.slice(468, 473);
    const rightIris = keypoints.slice(473, 478);

    console.log('Left iris points:', leftIris.length);
    console.log('Right iris points:', rightIris.length);

    // 両目の虹彩の中心を平均
    const allIrisPoints = [...leftIris, ...rightIris];
    const irisCenter = this.calculateCenter(allIrisPoints);

    console.log('Iris center:', irisCenter);

    return {
      irisCenter,
      faceDetected: true,
      keypoints,
    };
  }

  private calculateCenter(points: faceLandmarksDetection.Keypoint[]): Point {
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
