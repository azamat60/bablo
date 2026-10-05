export type RecordingState = "idle" | "requesting" | "recording" | "stopping";
type Media = {
  getUserMedia: () => Promise<MediaStream>;
  recorder: (stream: MediaStream) => MediaRecorder;
  file: (chunks: Blob[], mime: string) => File;
};
export class Microphone {
  state: RecordingState = "idle";
  private generation = 0;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private media: Media;
  private change: (state: RecordingState, seconds: number) => void;
  private finish: (file: File) => void;
  constructor(
    media: Media,
    change: (state: RecordingState, seconds: number) => void,
    finish: (file: File) => void,
  ) {
    this.media = media;
    this.change = change;
    this.finish = finish;
  }
  cancel() {
    ++this.generation;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.recorder) {
      this.recorder.onstop = null;
      this.recorder.ondataavailable = null;
      if (this.recorder.state !== "inactive") this.recorder.stop();
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.recorder = null;
    this.stream = null;
    this.state = "idle";
    this.change("idle", 0);
  }
  async toggle() {
    if (this.state === "recording") {
      this.state = "stopping";
      this.change("stopping", 0);
      this.recorder?.stop();
      return;
    }
    if (this.state !== "idle") return;
    this.state = "requesting";
    this.change("requesting", 0);
    const generation = ++this.generation;
    const stream = await this.media.getUserMedia().catch((error) => {
      if (generation === this.generation) this.cancel();
      throw error;
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    try {
      this.begin(stream, generation);
    } catch (error) {
      this.cancel();
      throw error;
    }
  }
  private begin(stream: MediaStream, generation: number) {
    const recorder = this.media.recorder(stream);
    this.recorder = recorder;
    const chunks: Blob[] = [];
    let size = 0,
      seconds = 0;
    recorder.ondataavailable = (event) => {
      if (event.data.size) {
        chunks.push(event.data);
        size += event.data.size;
        if (size >= 9 * 1024 * 1024 && recorder.state === "recording")
          this.stop();
      }
    };
    recorder.onstop = () => {
      if (generation !== this.generation) return;
      const file = this.media.file(chunks, recorder.mimeType);
      this.cancel();
      if (file.size) this.finish(file);
    };
    recorder.onerror = () => this.cancel();
    recorder.start(1000);
    this.state = "recording";
    this.change("recording", 0);
    this.timer = setInterval(() => {
      this.change(this.state, ++seconds);
      if (seconds >= 60 && this.state === "recording") this.stop();
    }, 1000);
  }
  private stop() {
    this.state = "stopping";
    this.change("stopping", 0);
    this.recorder?.stop();
  }
}
