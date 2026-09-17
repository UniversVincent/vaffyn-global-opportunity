import { useCallback, useEffect, useRef, useState } from 'react';

export default function useLocalRecording() {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording' | 'ready' | 'error'>(
    'idle',
  );
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const generation = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number>();

  const release = useCallback(() => {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
  }, []);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') {
      recorder.current.stop();
    }
  }, []);

  const discard = useCallback(() => {
    generation.current += 1;
    stop();
    release();
    setBlob(null);
    setSeconds(0);
    setState('idle');
  }, [release, stop]);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      generation.current += 1;
      stop();
      release();
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [release, stop]);

  const start = async () => {
    if (state === 'requesting' || state === 'recording' || blob) {
      return;
    }
    const run = ++generation.current;
    setState('requesting');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('RECORDING_UNAVAILABLE');
      }
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (run !== generation.current) {
        audio.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = audio;
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((item) =>
        MediaRecorder.isTypeSupported(item),
      );
      const capture = new MediaRecorder(audio, type ? { mimeType: type } : undefined);
      recorder.current = capture;
      const chunks: Blob[] = [];
      let size = 0;
      capture.ondataavailable = (event) => {
        if (run !== generation.current) {
          return;
        }
        size += event.data.size;
        if (size > 5 * 1024 * 1024) {
          generation.current += 1;
          stop();
          release();
          setState('error');
          return;
        }
        if (event.data.size) {
          chunks.push(event.data);
        }
      };
      capture.onstop = () => {
        if (run !== generation.current) {
          return;
        }
        const audioBlob = new Blob(chunks, { type: capture.mimeType });
        release();
        setBlob(audioBlob.size ? audioBlob : null);
        setState(audioBlob.size ? 'ready' : 'error');
      };
      capture.onerror = () => {
        generation.current += 1;
        release();
        setState('error');
      };
      capture.start(250);
      const started = Date.now();
      setSeconds(0);
      setState('recording');
      timer.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(Math.min(60, elapsed));
        if (elapsed >= 60) {
          stop();
        }
      }, 250);
    } catch {
      if (run === generation.current) {
        release();
        setState('error');
      }
    }
  };

  return { state, blob, url, seconds, start, stop, discard };
}
