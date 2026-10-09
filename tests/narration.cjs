const path = require('node:path');
const fs = require('node:fs/promises');
const { run, binaries, pythonAt } = require('../electron/services.cjs');
const root = path.resolve('.runtime');
(async () => {
  const dir = path.join(root, 'narration-test'); await fs.mkdir(dir, { recursive: true });
  const wav = path.join(dir, 'speech.wav');
  // Author synthetic speech; no microphone or user audio is captured by this test.
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Add-Type -AssemblyName System.Speech; $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speaker.SetOutputToWaveFile($env:RECORD_TEST_WAV); $speaker.Speak('Enter a title for the note. Select save note. Verify the saved title appears.'); $speaker.Dispose()"], { env: { ...process.env, RECORD_TEST_WAV: wav } });
  const b = binaries();
  const video = path.join(dir, 'speech.webm');
  await run(b.ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=white:s=640x360:r=15', '-i', wav, '-shortest', '-c:v', 'libvpx-vp9', '-c:a', 'libopus', video]);
  const env = { ...process.env, PATH: [path.dirname(b.ffmpeg), path.dirname(b.ffprobe), process.env.PATH].join(path.delimiter) };
  await run(pythonAt(root), ['-m', 'claude_real_video', video, '-o', path.join(dir, 'evidence'), '--overwrite', '--max-frames', '2'], { env, onOutput: text => process.stdout.write(text) });
  const transcript = await fs.readFile(path.join(dir, 'evidence', 'transcript.txt'), 'utf8');
  if (!/title|note|save/i.test(transcript)) throw new Error('Synthetic narration was not transcribed.');
  console.log('Verified local narration transcription:', transcript.trim());
})().catch(error => { console.error(error.message); process.exitCode = 1; });
