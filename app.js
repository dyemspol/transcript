document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const apiKeyInput = document.getElementById('api-key');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const playerContainer = document.getElementById('player-container');
    const audioPlayer = document.getElementById('audio-player');
    const btnTranscribe = document.getElementById('btn-transcribe');
    
    const statusContainer = document.getElementById('status-container');
    const statusText = document.getElementById('status-text');
    const waveAnimation = document.querySelector('.wave-animation');
    
    const timelineContainer = document.getElementById('timeline-container');
    const exportActions = document.getElementById('export-actions');
    const btnExportTxt = document.getElementById('btn-export-txt');
    const btnExportSrt = document.getElementById('btn-export-srt');
    const btnCopyAll = document.getElementById('btn-copy-all');

    // State
    let currentFile = null;
    let transcriptData = null; // Store AssemblyAI response
    let utteranceElements = []; // DOM elements for sync

    const DEBUG_MODE = false;
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

    // --- Initialization ---
    // (Key is hardcoded in the HTML as read-only per deployment requirements)

    // --- File Upload Handling ---
    const handleFile = async (file) => {
        if (!file) return;

        if (file.size > MAX_FILE_SIZE) {
            alert('File exceeds the 50MB size limit.');
            return;
        }

        // Strict Magic Byte Validation
        try {
            const buffer = await file.slice(0, 12).arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
            
            let isValid = false;
            // ID3 (mp3) or Sync Word (mp3)
            if (hex.startsWith('494433') || hex.startsWith('fffb') || hex.startsWith('fff3') || hex.startsWith('fff2')) isValid = true;
            // RIFF (wav)
            if (hex.startsWith('52494646')) isValid = true;
            // ftyp (m4a/mp4 - typically bytes 4-7)
            if (hex.substring(8, 16) === '66747970') isValid = true;

            if (!isValid) {
                alert('Security Error: Invalid audio file format detected.');
                return;
            }
        } catch(e) {
            alert('Could not read file for validation.');
            return;
        }
        currentFile = file;
        
        // Setup Audio Player using Object URL
        const fileURL = URL.createObjectURL(file);
        audioPlayer.src = fileURL;
        playerContainer.classList.remove('hidden');
        
        // Reset UI state
        timelineContainer.classList.add('hidden');
        timelineContainer.innerHTML = '';
        exportActions.classList.add('hidden');
        statusContainer.classList.remove('hidden');
        
        setStatus('Ready to transcribe', false);
    };

    // Drag and Drop integration
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // --- Transcription Service (AssemblyAI) ---
    const setStatus = (text, isLoading = false) => {
        statusText.textContent = text;
        if (isLoading) waveAnimation.classList.add('loading');
        else waveAnimation.classList.remove('loading');
    };

    btnTranscribe.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            alert('Please enter your AssemblyAI API key.');
            return;
        }
        if (!currentFile) {
            alert('Please upload an audio file first.');
            return;
        }

        btnTranscribe.disabled = true;
        btnTranscribe.innerHTML = '<span>Processing...</span>';
        setStatus('Uploading audio...', true);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

            // 1. Upload File
            const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
                method: 'POST',
                headers: { 'Authorization': apiKey },
                body: currentFile,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!uploadResponse.ok) {
                throw new Error(`Upload failed`);
            }
            
            const uploadData = await uploadResponse.json();
            const audioUrl = uploadData.upload_url;

            // 2. Request Transcription with Diarization
            setStatus('Transcribing audio (this may take a minute)...', true);
            const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
                method: 'POST',
                headers: {
                    'Authorization': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    audio_url: audioUrl,
                    speaker_labels: true // Enable speaker diarization
                })
            });

            if (!transcriptResponse.ok) {
                throw new Error(`Transcription request failed`);
            }
            
            const transcriptReqData = await transcriptResponse.json();
            const transcriptId = transcriptReqData.id;

            // 3. Poll for Completion
            await pollTranscript(transcriptId, apiKey);

        } catch (error) {
            if (DEBUG_MODE) console.error(error);
            alert(`A network or API error occurred. Please try again.`);
            setStatus('Transcription failed.', false);
            btnTranscribe.disabled = false;
            btnTranscribe.innerHTML = '<span>Transcribe Audio</span>';
        }
    });

    const pollTranscript = async (transcriptId, apiKey) => {
        const checkStatus = async () => {
            try {
                const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
                    headers: { 'Authorization': apiKey }
                });
                
                if (!response.ok) throw new Error('Failed to fetch transcript status');
                const data = await response.json();

                if (data.status === 'completed') {
                    try {
                        const sentRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}/sentences`, { headers: { 'Authorization': apiKey } });
                        if (sentRes.ok) {
                            const sentData = await sentRes.json();
                            if (sentData.sentences) data.sentences = sentData.sentences;
                        }
                    } catch (e) {
                if (DEBUG_MODE) console.error('Could not fetch sentences', e);
                    }
                    handleTranscriptionComplete(data);
                } else if (data.status === 'error') {
                    throw new Error('Transcription failed during processing.');
                } else {
                    // Still processing, poll again in 3 seconds
                    setTimeout(checkStatus, 3000);
                }
            } catch (error) {
                if (DEBUG_MODE) console.error(error);
                alert(`An error occurred while polling for results.`);
                setStatus('Transcription failed.', false);
                btnTranscribe.disabled = false;
                btnTranscribe.innerHTML = '<span>Transcribe Audio</span>';
            }
        };
        await checkStatus();
    };

    const handleTranscriptionComplete = (data) => {
        btnTranscribe.disabled = false;
        btnTranscribe.innerHTML = '<span>Transcribe Audio</span>';
        statusContainer.classList.add('hidden');
        
        transcriptData = data;
        
        // Prefer sentences for a sentence-by-sentence timeline. Fallback to utterances, or full text.
        transcriptData.timelineItems = data.sentences || data.utterances || [{
            text: data.text,
            start: 0,
            end: data.audio_duration * 1000
        }];
        
        renderTimeline(transcriptData.timelineItems);
        
        timelineContainer.classList.remove('hidden');
        exportActions.classList.remove('hidden');
    };

    // --- Rendering Timeline ---
    const formatTime = (ms) => {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const getSpeakerColorClass = (speakerLabel) => {
        // Speaker labels are usually 'A', 'B', etc.
        const charCode = speakerLabel.charCodeAt(0) || 65;
        const colorIndex = ((charCode - 65) % 4) + 1; // Maps A->1, B->2, C->3, D->4
        return `speaker-${colorIndex}`;
    };

    const renderTimeline = (utterances) => {
        timelineContainer.innerHTML = '';
        utteranceElements = [];

        if (utterances.length === 0) {
            timelineContainer.innerHTML = '<p style="text-align:center; color: var(--text-muted); padding: 20px;">No speech detected.</p>';
            return;
        }

        utterances.forEach((u) => {
            const el = document.createElement('div');
            el.className = 'utterance';
            el.dataset.start = u.start;
            el.dataset.end = u.end;
            
            // XSS Prevention: Secure DOM creation
            const metaInfo = document.createElement('div');
            metaInfo.className = 'meta-info';
            
            const timestampSpan = document.createElement('span');
            timestampSpan.className = 'timestamp timestamp-text';
            timestampSpan.textContent = `[${formatTime(u.start)}]`;
            
            metaInfo.appendChild(timestampSpan);
            
            const transcriptDiv = document.createElement('div');
            transcriptDiv.className = 'transcript-text';
            transcriptDiv.textContent = u.text; // Automatically escapes HTML
            
            el.appendChild(metaInfo);
            el.appendChild(transcriptDiv);

            // Click segment to seek audio
            el.addEventListener('click', () => {
                audioPlayer.currentTime = u.start / 1000;
                audioPlayer.play().catch(e => console.log('Autoplay prevented', e));
            });

            timelineContainer.appendChild(el);
            utteranceElements.push(el);
        });
    };

    // --- Audio Playback Sync ---
    let autoScrollEnabled = true;

    // Optional: disable auto-scroll if user scrolls manually
    timelineContainer.addEventListener('wheel', () => {
        autoScrollEnabled = false;
        // Re-enable auto-scroll after a delay
        clearTimeout(timelineContainer.scrollTimeout);
        timelineContainer.scrollTimeout = setTimeout(() => {
            autoScrollEnabled = true;
        }, 3000);
    });

    audioPlayer.addEventListener('timeupdate', () => {
        if (!transcriptData || utteranceElements.length === 0) return;
        
        const currentTimeMs = audioPlayer.currentTime * 1000;
        
        utteranceElements.forEach(el => {
            const start = parseInt(el.dataset.start);
            const end = parseInt(el.dataset.end);
            
            if (currentTimeMs >= start && currentTimeMs <= end) {
                if (!el.classList.contains('active')) {
                    el.classList.add('active');
                    
                    if (autoScrollEnabled) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            } else {
                el.classList.remove('active');
            }
        });
    });

    // --- Export Utilities ---
    const downloadBlob = (content, filename, type) => {
        const blob = new window.Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    btnExportTxt.addEventListener('click', () => {
        if (!transcriptData || !transcriptData.timelineItems) return;
        
        const text = transcriptData.timelineItems.map(u => {
            return `[${formatTime(u.start)}] ${u.text}`;
        }).join('\n');
        
        downloadBlob(text, 'transcript.txt', 'text/plain');
    });

    btnExportSrt.addEventListener('click', () => {
        if (!transcriptData || !transcriptData.timelineItems) return;
        const utterances = transcriptData.timelineItems;
        
        const formatSrtTime = (ms) => {
            const date = new Date(ms);
            const hours = Math.floor(ms / 3600000).toString().padStart(2, '0');
            const minutes = date.getUTCMinutes().toString().padStart(2, '0');
            const seconds = date.getUTCSeconds().toString().padStart(2, '0');
            const milliseconds = date.getUTCMilliseconds().toString().padStart(3, '0');
            return `${hours}:${minutes}:${seconds},${milliseconds}`;
        };

        const srt = utterances.map((u, index) => {
            const speaker = u.speaker ? `Speaker ${u.speaker}: ` : '';
            return `${index + 1}\n${formatSrtTime(u.start)} --> ${formatSrtTime(u.end)}\n${speaker}${u.text}`;
        }).join('\n\n');
        
        downloadBlob(srt, 'transcript.srt', 'text/plain');
    });

    btnCopyAll.addEventListener('click', async () => {
        if (!transcriptData || !transcriptData.timelineItems) return;
        
        const text = transcriptData.timelineItems.map(u => {
            return `[${formatTime(u.start)}] ${u.text}`;
        }).join('\n');
        
        try {
            await navigator.clipboard.writeText(text);
            const originalText = btnCopyAll.textContent;
            btnCopyAll.textContent = 'Copied!';
            setTimeout(() => { btnCopyAll.textContent = originalText; }, 2000);
        } catch (err) {
            if (DEBUG_MODE) console.error('Failed to copy: ', err);
            alert('Failed to copy to clipboard.');
        }
    });
});
