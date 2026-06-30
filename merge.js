// ═══════════════════════════════════════════════════
// TAB SWITCHER
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    const tabBtns        = document.querySelectorAll('.tab-btn');
    const panelTranscribe = document.getElementById('panel-transcribe');
    const panelMerge     = document.getElementById('panel-merge');
    const rightTranscribe = document.getElementById('right-transcribe');
    const rightMerge     = document.getElementById('right-merge');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');

            if (btn.dataset.tab === 'transcribe') {
                panelTranscribe.classList.remove('hidden');
                panelMerge.classList.add('hidden');
                rightTranscribe.classList.remove('hidden');
                rightMerge.classList.add('hidden');
            } else {
                panelTranscribe.classList.add('hidden');
                panelMerge.classList.remove('hidden');
                rightTranscribe.classList.add('hidden');
                rightMerge.classList.remove('hidden');
            }
        });
    });
});

// ═══════════════════════════════════════════════════
// AUDIO MERGER
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

    // Elements
    const mergeDropZone      = document.getElementById('merge-drop-zone');
    const mergeFileInput     = document.getElementById('merge-file-input');
    const mergePlayerSection = document.getElementById('merge-player-container');
    const mergeAudioPlayer   = document.getElementById('merge-audio-player');
    const btnDoMerge         = document.getElementById('btn-do-merge');
    const downloadCard       = document.getElementById('merge-download-card');
    const fileMeta           = document.getElementById('merge-file-meta');
    const btnMergeDownload   = document.getElementById('btn-merge-download');

    const statusContainer    = document.getElementById('merge-status-container');
    const statusText         = document.getElementById('merge-status-text');
    const mergeWave          = document.getElementById('merge-wave');
    const progressWrap       = document.getElementById('merge-progress-wrap');
    const progressFill       = document.getElementById('merge-progress-fill');

    const fileListEl         = document.getElementById('merge-file-list');
    const headerActions      = document.getElementById('merge-header-actions');
    const countBadge         = document.getElementById('merge-count-badge');
    const btnMergeClear      = document.getElementById('btn-merge-clear');

    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
    let selectedFiles  = [];
    let mergedBlobUrl  = null;

    // ── helpers ──────────────────────────────────────
    const formatBytes = b => b < 1048576
        ? (b / 1024).toFixed(1) + ' KB'
        : (b / 1048576).toFixed(1) + ' MB';

    const setProgress = (pct, msg) => {
        progressFill.style.width = pct + '%';
        statusText.textContent   = msg;
    };

    const refreshUI = () => {
        const count = selectedFiles.length;
        countBadge.textContent           = count + (count === 1 ? ' file' : ' files');
        headerActions.style.display      = count > 0 ? 'flex' : 'none';
        btnDoMerge.disabled              = count < 2;

        if (count > 0) {
            statusContainer.classList.add('hidden');
            fileListEl.classList.remove('hidden');
            mergePlayerSection.classList.remove('hidden');
        } else {
            statusContainer.classList.remove('hidden');
            statusText.textContent = 'Select 2 or more audio files to merge';
            fileListEl.classList.add('hidden');
            mergePlayerSection.classList.add('hidden');
        }
        renderList();
    };

    const renderList = () => {
        fileListEl.innerHTML = '';
        selectedFiles.forEach((file, i) => {
            const row = document.createElement('div');
            row.className = 'utterance';

            // Part label
            const meta = document.createElement('div');
            meta.className = 'meta-info';
            const label = document.createElement('span');
            label.className = 'timestamp timestamp-text';
            label.textContent = `Part ${i + 1}`;
            meta.appendChild(label);

            // File info
            const info = document.createElement('div');
            info.className = 'transcript-text';
            const nameEl = document.createElement('div');
            nameEl.textContent = file.name;                          // safe: textContent
            const sizeEl = document.createElement('div');
            sizeEl.style.cssText = 'font-size:.73rem;color:var(--text-muted);margin-top:3px';
            sizeEl.textContent = formatBytes(file.size);
            info.appendChild(nameEl);
            info.appendChild(sizeEl);

            // Remove button
            const rmBtn = document.createElement('button');
            rmBtn.title = 'Remove';
            rmBtn.style.cssText = 'flex:0 0 auto;background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;border-radius:4px;display:flex;align-items:center;transition:color .15s';
            rmBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
            rmBtn.addEventListener('mouseenter', () => rmBtn.style.color = '#f87171');
            rmBtn.addEventListener('mouseleave', () => rmBtn.style.color = '');
            rmBtn.addEventListener('click', () => {
                selectedFiles.splice(i, 1);
                resetResult();
                refreshUI();
            });

            row.appendChild(meta);
            row.appendChild(info);
            row.appendChild(rmBtn);
            fileListEl.appendChild(row);
        });
    };

    const resetResult = () => {
        downloadCard.classList.add('hidden');
        mergeAudioPlayer.src = '';
        if (mergedBlobUrl) { URL.revokeObjectURL(mergedBlobUrl); mergedBlobUrl = null; }
    };

    // ── Magic byte validation ─────────────────────────
    const validateAndAdd = async files => {
        for (const file of Array.from(files)) {
            if (file.size > MAX_FILE_SIZE) {
                alert(`"${file.name}" exceeds the 50 MB limit and was skipped.`);
                continue;
            }
            try {
                const buf = await file.slice(0, 12).arrayBuffer();
                const hex = Array.from(new Uint8Array(buf))
                    .map(b => b.toString(16).padStart(2, '0')).join('');
                let ok = false;
                if (/^(494433|fffb|fff3|fff2)/.test(hex)) ok = true; // MP3
                if (hex.startsWith('52494646'))             ok = true; // WAV
                if (hex.substring(8, 16) === '66747970')   ok = true; // M4A
                if (!ok) { alert(`"${file.name}" is not a valid audio file.`); continue; }
            } catch { alert(`Could not read "${file.name}".`); continue; }
            selectedFiles.push(file);
        }
        resetResult();
        refreshUI();
    };

    // ── Events ───────────────────────────────────────
    mergeDropZone.addEventListener('click',  ()  => mergeFileInput.click());
    mergeDropZone.addEventListener('dragover', e => { e.preventDefault(); mergeDropZone.classList.add('dragover'); });
    mergeDropZone.addEventListener('dragleave',() => mergeDropZone.classList.remove('dragover'));
    mergeDropZone.addEventListener('drop',   e  => {
        e.preventDefault();
        mergeDropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) validateAndAdd(e.dataTransfer.files);
    });
    mergeFileInput.addEventListener('change', e => {
        if (e.target.files.length) validateAndAdd(e.target.files);
        mergeFileInput.value = '';
    });

    btnMergeClear.addEventListener('click', () => {
        selectedFiles = [];
        resetResult();
        refreshUI();
    });

    // ── Merge ────────────────────────────────────────
    btnDoMerge.addEventListener('click', async () => {
        if (selectedFiles.length < 2) return;

        btnDoMerge.disabled = true;
        downloadCard.classList.add('hidden');
        fileListEl.classList.add('hidden');
        statusContainer.classList.remove('hidden');
        mergeWave.classList.add('loading');
        progressWrap.classList.remove('hidden');
        setProgress(0, 'Starting...');

        try {
            const ctx      = new (window.AudioContext || window.webkitAudioContext)();
            const decoded  = [];

            for (let i = 0; i < selectedFiles.length; i++) {
                setProgress(
                    Math.round((i / selectedFiles.length) * 65),
                    `Decoding part ${i + 1} of ${selectedFiles.length}…`
                );
                decoded.push(await ctx.decodeAudioData(await selectedFiles[i].arrayBuffer()));
            }

            setProgress(72, 'Stitching audio…');
            let totalLen = 0, numChan = 1;
            const sr = decoded[0].sampleRate;
            decoded.forEach(b => {
                totalLen += b.length;
                if (b.numberOfChannels > numChan) numChan = b.numberOfChannels;
            });

            const combined = ctx.createBuffer(numChan, totalLen, sr);
            for (let ch = 0; ch < numChan; ch++) {
                const dest = combined.getChannelData(ch);
                let offset = 0;
                decoded.forEach(b => {
                    dest.set(b.getChannelData(ch < b.numberOfChannels ? ch : 0), offset);
                    offset += b.length;
                });
            }

            setProgress(90, 'Encoding MP3…');
            const blob     = encodeMp3(combined);
            mergedBlobUrl  = URL.createObjectURL(blob);

            setProgress(100, 'Done!');
            await new Promise(r => setTimeout(r, 350));

            // Show result
            mergeWave.classList.remove('loading');
            progressWrap.classList.add('hidden');
            statusContainer.classList.add('hidden');
            fileListEl.classList.remove('hidden');
            mergeAudioPlayer.src = mergedBlobUrl;

            const mins  = (combined.length / sr / 60).toFixed(1);
            const sizeMB = (blob.size / 1048576).toFixed(1);
            fileMeta.textContent = `${mins} min · ${sizeMB} MB · MP3`;
            downloadCard.classList.remove('hidden');
            btnDoMerge.disabled = false;

        } catch {
            mergeWave.classList.remove('loading');
            progressWrap.classList.add('hidden');
            statusContainer.classList.add('hidden');
            fileListEl.classList.remove('hidden');
            btnDoMerge.disabled = false;
            alert('Failed to merge audio. Files may be too large or in an unsupported format.');
        }
    });

    btnMergeDownload.addEventListener('click', () => {
        if (!mergedBlobUrl) return;
        const a = document.createElement('a');
        a.href = mergedBlobUrl;
        a.download = 'merged_audio.mp3';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    // ── MP3 encoder (lamejs) ─────────────────────────
    function encodeMp3(audioBuffer) {
        const channels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const kbps = 128; 
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
        const mp3Data = [];
        
        const samples1 = audioBuffer.getChannelData(0);
        const samples2 = channels > 1 ? audioBuffer.getChannelData(1) : new Float32Array(samples1.length);
        
        const sampleBlockSize = 1152; // multiple of 576
        for (let i = 0; i < samples1.length; i += sampleBlockSize) {
            let leftChunk = samples1.subarray(i, i + sampleBlockSize);
            let rightChunk = samples2.subarray(i, i + sampleBlockSize);
            
            let leftInt16 = new Int16Array(leftChunk.length);
            let rightInt16 = new Int16Array(rightChunk.length);
            
            for (let j = 0; j < leftChunk.length; j++) {
                let s1 = Math.max(-1, Math.min(1, leftChunk[j]));
                leftInt16[j] = s1 < 0 ? s1 * 32768 : s1 * 32767;
                
                let s2 = Math.max(-1, Math.min(1, rightChunk[j]));
                rightInt16[j] = s2 < 0 ? s2 * 32768 : s2 * 32767;
            }

            let mp3buf = channels === 1 
                ? mp3encoder.encodeBuffer(leftInt16) 
                : mp3encoder.encodeBuffer(leftInt16, rightInt16);
                
            if (mp3buf.length > 0) mp3Data.push(mp3buf);
        }
        
        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
        
        return new Blob(mp3Data, { type: 'audio/mp3' });
    }
});
