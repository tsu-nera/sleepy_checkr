import { FaceDetector } from './detector';
import { PERCLOSDetector } from './perclos-detector';
import './style.css';

type SpotCheckState = 'idle' | 'initializing' | 'measuring' | 'result';

class SpotCheckApp {
  private video: HTMLVideoElement;
  private videoContainer: HTMLElement;
  private detector: FaceDetector;
  private perclosDetector: PERCLOSDetector | null = null;

  // UI elements
  private idleState: HTMLElement;
  private measuringState: HTMLElement;
  private resultState: HTMLElement;
  private infoElement: HTMLElement;
  private startBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private retryBtn: HTMLButtonElement;
  private cameraToggleBtn: HTMLButtonElement;
  private cameraToggleText: HTMLElement;
  private timerElement: HTMLElement;
  private progressElement: HTMLElement;
  private resultLevelElement: HTMLElement;
  private resultScoreElement: HTMLElement;
  private resultPERCLOSElement: HTMLElement;

  // State
  private currentState: SpotCheckState = 'idle';
  private isRunning = false;
  private isCameraVisible = false;
  private measurementStartTime = 0;
  private readonly MEASUREMENT_DURATION_MS = 30000; // 30秒

  constructor() {
    this.video = document.getElementById('webcam') as HTMLVideoElement;
    this.videoContainer = document.getElementById('video-container')!;
    this.detector = new FaceDetector();

    // State containers
    this.idleState = document.getElementById('idle-state')!;
    this.measuringState = document.getElementById('measuring-state')!;
    this.resultState = document.getElementById('result-state')!;
    this.infoElement = document.getElementById('info')!;

    // Buttons
    this.startBtn = document.getElementById('start-btn') as HTMLButtonElement;
    this.cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;
    this.retryBtn = document.getElementById('retry-btn') as HTMLButtonElement;
    this.cameraToggleBtn = document.getElementById('camera-toggle') as HTMLButtonElement;
    this.cameraToggleText = document.getElementById('camera-toggle-text')!;

    // Timer elements
    this.timerElement = document.getElementById('timer')!;
    this.progressElement = document.getElementById('progress')!;

    // Result elements
    this.resultLevelElement = document.getElementById('result-level')!;
    this.resultScoreElement = document.getElementById('result-score')!;
    this.resultPERCLOSElement = document.getElementById('result-perclos')!;

    // デフォルトでカメラを非表示
    this.videoContainer.classList.add('hidden');

    // Event listeners
    this.startBtn.addEventListener('click', () => this.startMeasurement());
    this.cancelBtn.addEventListener('click', () => this.cancelMeasurement());
    this.retryBtn.addEventListener('click', () => this.retryMeasurement());
    this.cameraToggleBtn.addEventListener('click', () => this.toggleCamera());
  }

  private setState(state: SpotCheckState): void {
    this.currentState = state;

    // Hide all state containers
    this.idleState.style.display = 'none';
    this.measuringState.style.display = 'none';
    this.resultState.style.display = 'none';

    // Show the active state
    switch (state) {
      case 'idle':
        this.idleState.style.display = 'block';
        this.updateInfo('測定開始ボタンを押してください');
        break;
      case 'initializing':
        this.measuringState.style.display = 'block';
        this.updateInfo('カメラとモデルを初期化しています...');
        break;
      case 'measuring':
        this.measuringState.style.display = 'block';
        this.updateInfo('測定中... カメラを見つめてください');
        break;
      case 'result':
        this.resultState.style.display = 'block';
        this.updateInfo('測定完了');
        break;
    }
  }

  private async startMeasurement(): Promise<void> {
    try {
      this.setState('initializing');

      // カメラアクセス
      this.updateInfo('カメラにアクセスしています...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      this.video.srcObject = stream;

      // video要素がメタデータを読み込むまで待機
      await new Promise<void>((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve();
        };
      });

      console.log('Video ready:', this.video.videoWidth, 'x', this.video.videoHeight);

      // 顔検出モデル初期化
      this.updateInfo('顔検出モデルを読み込んでいます...');
      await this.detector.initialize();

      // PERCLOS検出器の初期化
      this.perclosDetector = new PERCLOSDetector();

      // 測定開始
      this.setState('measuring');
      this.measurementStartTime = Date.now();
      this.isRunning = true;
      this.startDetectionLoop();
      this.startTimer();
    } catch (error) {
      console.error('Initialization error:', error);
      this.updateInfo(`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
      this.stopCamera();
      this.setState('idle');
    }
  }

  private cancelMeasurement(): void {
    this.isRunning = false;
    this.stopCamera();
    this.setState('idle');
  }

  private retryMeasurement(): void {
    this.setState('idle');
  }

  private toggleCamera(): void {
    this.isCameraVisible = !this.isCameraVisible;

    if (this.isCameraVisible) {
      this.videoContainer.classList.remove('hidden');
      this.cameraToggleText.textContent = 'カメラ表示: ON';
      this.cameraToggleBtn.classList.add('active');
    } else {
      this.videoContainer.classList.add('hidden');
      this.cameraToggleText.textContent = 'カメラ表示: OFF';
      this.cameraToggleBtn.classList.remove('active');
    }
  }

  private async startDetectionLoop(): Promise<void> {
    const detect = async () => {
      if (!this.isRunning) return;

      try {
        const result = await this.detector.detect(this.video);

        if (result.faceDetected && result.keypoints && this.perclosDetector) {
          // PERCLOS検出器を更新
          this.perclosDetector.update(result.keypoints);
        }

        // 測定時間チェック
        const elapsed = Date.now() - this.measurementStartTime;
        if (elapsed >= this.MEASUREMENT_DURATION_MS) {
          this.completeMeasurement();
          return;
        }
      } catch (error) {
        console.error('Detection error:', error);
      }

      // 次のフレームを処理
      requestAnimationFrame(detect);
    };

    detect();
  }

  private startTimer(): void {
    const updateTimer = () => {
      if (!this.isRunning) return;

      const elapsed = Date.now() - this.measurementStartTime;
      const remaining = Math.max(0, this.MEASUREMENT_DURATION_MS - elapsed);
      const secondsRemaining = Math.ceil(remaining / 1000);

      // タイマー表示更新
      this.timerElement.textContent = secondsRemaining.toString();

      // プログレスバー更新
      const progress = (elapsed / this.MEASUREMENT_DURATION_MS) * 100;
      this.progressElement.style.width = `${Math.min(100, progress)}%`;

      if (remaining > 0) {
        requestAnimationFrame(updateTimer);
      }
    };

    updateTimer();
  }

  private completeMeasurement(): void {
    this.isRunning = false;

    if (!this.perclosDetector) {
      this.updateInfo('エラー: 測定データがありません');
      this.stopCamera();
      this.setState('idle');
      return;
    }

    // 結果取得
    const score = this.perclosDetector.getScore();
    console.log('Final score:', score);

    // 結果表示
    this.resultLevelElement.textContent = score.level;
    this.resultScoreElement.textContent = score.score.toString();
    this.resultPERCLOSElement.textContent = score.details.replace('PERCLOS ', '');

    // レベルに応じた色設定
    if (score.level === '正常') {
      this.resultLevelElement.style.color = '#4CAF50'; // 緑
    } else if (score.level === 'やや疲労') {
      this.resultLevelElement.style.color = '#FF9800'; // オレンジ
    } else {
      this.resultLevelElement.style.color = '#F44336'; // 赤
    }

    // スコアに応じた色設定
    if (score.score >= 80) {
      this.resultScoreElement.style.color = '#4CAF50'; // 緑
    } else if (score.score >= 60) {
      this.resultScoreElement.style.color = '#2196F3'; // 青
    } else if (score.score >= 40) {
      this.resultScoreElement.style.color = '#FF9800'; // オレンジ
    } else {
      this.resultScoreElement.style.color = '#F44336'; // 赤
    }

    this.stopCamera();
    this.setState('result');
  }

  private stopCamera(): void {
    if (this.video.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      this.video.srcObject = null;
    }
  }

  private updateInfo(message: string): void {
    this.infoElement.textContent = message;
  }
}

// アプリケーション起動
const app = new SpotCheckApp();
