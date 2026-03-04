import { useState, useRef, useCallback } from 'react';

interface UseMediaRecorderReturn {
  isRecording: boolean;
  duration: number;
  stream: MediaStream | null;
  startRecording: (type: 'audio' | 'video') => Promise<void>;
  stopRecording: () => Promise<string | null>;
  error: string | null;
}

export function useMediaRecorder(): UseMediaRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);

  const startRecording = useCallback(async (type: 'audio' | 'video') => {
    try {
      setError(null);
      const constraints = type === 'audio' 
        ? { audio: true, video: false }
        : { audio: true, video: { width: 640, height: 480 } };
      
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      
      const mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: type === 'audio' ? 'audio/webm' : 'video/webm'
      });
      
      chunksRef.current = [];
      durationRef.current = 0;
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      
      setIsRecording(true);
      
      intervalRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      throw err;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve(null);
        return;
      }

      const mimeType = mediaRecorderRef.current.mimeType;
      
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        
        setIsRecording(false);
        setDuration(0);
        setStream(null);
        
        resolve(url);
      };
      
      mediaRecorderRef.current.stop();
    });
  }, [stream]);

  return {
    isRecording,
    duration,
    stream,
    startRecording,
    stopRecording,
    error,
  };
}
