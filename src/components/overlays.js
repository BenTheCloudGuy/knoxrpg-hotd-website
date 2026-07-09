// ══════════════════════════════════════════════════════════════
// ── ZOOM/PAN OVERLAY BLOCKS (Maps & Artifacts) ───────────────
// ══════════════════════════════════════════════════════════════

/**
 * Returns the HTML + JS for the map zoom/pan overlay.
 * Used on the Maps page.
 */
function mapOverlayBlock() {
  return `
  <div class="map-overlay" id="mapOverlay">
    <div class="map-overlay-header">
      <span class="map-overlay-title" id="mapOverlayTitle"></span>
      <button class="map-overlay-close" onclick="closeMapOverlay()">&times;</button>
    </div>
    <div class="map-overlay-container" id="mapOverlayContainer">
      <img class="map-overlay-img" id="mapOverlayImg" draggable="false" />
    </div>
    <div class="map-overlay-controls">
      <button onclick="mapZoom(1.3)">&#128269;+ Zoom In</button>
      <button onclick="mapZoom(0.7)">&#128269;- Zoom Out</button>
      <button onclick="mapReset()">Reset</button>
    </div>
  </div>
  <script>
  (function(){
    var ov=document.getElementById('mapOverlay'),img=document.getElementById('mapOverlayImg'),
        cnt=document.getElementById('mapOverlayContainer'),sc=1,px=0,py=0,dr=false,sx=0,sy=0;
    window.openMapOverlay=function(u,t){img.src=u;document.getElementById('mapOverlayTitle').textContent=t;
      sc=1;px=0;py=0;img.style.transform='scale(1) translate(0px,0px)';ov.classList.add('active');document.body.style.overflow='hidden';};
    window.closeMapOverlay=function(){ov.classList.remove('active');document.body.style.overflow='';img.src='';};
    window.mapZoom=function(f){sc=Math.max(0.3,Math.min(8,sc*f));img.style.transform='scale('+sc+') translate('+px+'px,'+py+'px)';};
    window.mapReset=function(){sc=1;px=0;py=0;img.style.transform='scale(1) translate(0px,0px)';};
    img.addEventListener('mousedown',function(e){e.preventDefault();dr=true;sx=e.clientX/sc-px;sy=e.clientY/sc-py;img.classList.add('grabbing');});
    document.addEventListener('mousemove',function(e){if(!dr)return;px=e.clientX/sc-sx;py=e.clientY/sc-sy;img.style.transform='scale('+sc+') translate('+px+'px,'+py+'px)';});
    document.addEventListener('mouseup',function(){dr=false;img.classList.remove('grabbing');});
    cnt.addEventListener('wheel',function(e){if(!ov.classList.contains('active'))return;e.preventDefault();
      var f=e.deltaY<0?1.15:0.87;sc=Math.max(0.3,Math.min(8,sc*f));img.style.transform='scale('+sc+') translate('+px+'px,'+py+'px)';},{passive:false});
    var ld=0;cnt.addEventListener('touchstart',function(e){if(e.touches.length===2){ld=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}
      else if(e.touches.length===1){dr=true;sx=e.touches[0].clientX/sc-px;sy=e.touches[0].clientY/sc-py;}});
    cnt.addEventListener('touchmove',function(e){e.preventDefault();if(e.touches.length===2){var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      if(ld>0){sc=Math.max(0.3,Math.min(8,sc*(d/ld)));img.style.transform='scale('+sc+') translate('+px+'px,'+py+'px)';}ld=d;}
      else if(e.touches.length===1&&dr){px=e.touches[0].clientX/sc-sx;py=e.touches[0].clientY/sc-sy;img.style.transform='scale('+sc+') translate('+px+'px,'+py+'px)';}},{passive:false});
    cnt.addEventListener('touchend',function(){dr=false;ld=0;});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&ov.classList.contains('active'))closeMapOverlay();});
  })();
  </script>`;
}

/**
 * Returns the HTML + JS for the artifact/handout/art zoom/pan overlay.
 * Used on Artifacts, Handouts, Art Gallery, and detail pages.
 * @param {string} [defaultTitle='Artifact'] - Fallback title when none provided to openArtifactOverlay
 */
function artifactOverlayBlock(defaultTitle, opts) {
  const dt = defaultTitle || 'Artifact';
  const tagEditor = !!(opts && opts.tagEditor);
  const { TYPES } = require('../lib/image-tags');
  const typeOptions = TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
  return `
  <div class="map-overlay" id="artifactOverlay">
    <div class="map-overlay-header">
      <span class="map-overlay-title" id="artifactOverlayTitle"></span>
      <button class="map-overlay-close" onclick="closeArtifactOverlay()">&times;</button>
    </div>
    <div class="map-overlay-container" id="artifactOverlayContainer">
      <img class="map-overlay-img" id="artifactOverlayImg" draggable="false" />
    </div>
    <div class="map-overlay-controls">
      <button onclick="artifactZoom(1.3)">&#128269;+ Zoom In</button>
      <button onclick="artifactZoom(0.7)">&#128269;- Zoom Out</button>
      <button onclick="artifactReset()">Reset</button>
    </div>
    ${tagEditor ? `<div class="ov-tagbar" id="ovTagBar" style="display:none;">
      <span class="ov-tagsrc" id="ovTagSrc"></span>
      <label>Type <select id="ovTagType">${typeOptions}</select></label>
      <input id="ovTagCustom" placeholder="custom tags, comma-separated" />
      <button onclick="ovSaveTags()">Save Tags</button>
      <span id="ovTagStatus" class="ov-tagstatus"></span>
    </div>` : ''}
  </div>
  <script>
  (function(){
    var ov=document.getElementById('artifactOverlay'),img=document.getElementById('artifactOverlayImg'),
        cnt=document.getElementById('artifactOverlayContainer'),sc=1,px=0,py=0,dr=false,sx=0,sy=0;
    var TAGEDIT=${tagEditor ? 'true' : 'false'};
    window.openArtifactOverlay=function(u,t){if(!u)return;img.src=u;document.getElementById('artifactOverlayTitle').textContent=t||'${dt}';
      sc=1;px=0;py=0;img.style.transform='scale(1) translate(0px,0px)';ov.classList.add('active');document.body.style.overflow='hidden';
      if(TAGEDIT)ovLoadTags(u);};
    window.closeArtifactOverlay=function(){ov.classList.remove('active');document.body.style.overflow='';img.src='';};
    window.artifactZoom=function(f){sc=Math.max(0.3,Math.min(8,sc*f));img.style.transform='scale('+sc+') translate('+px+'px,'+py+'px)';};
    window.artifactReset=function(){sc=1;px=0;py=0;img.style.transform='scale(1) translate(0px,0px)';};
    img.addEventListener('mousedown',function(e){e.preventDefault();dr=true;sx=e.clientX/sc-px;sy=e.clientY/sc-py;img.classList.add('grabbing');});
    document.addEventListener('mousemove',function(e){if(!dr)return;px=e.clientX/sc-sx;py=e.clientY/sc-sy;img.style.transform='scale('+sc+') translate('+px+'px,'+py+'px)';});
    document.addEventListener('mouseup',function(){dr=false;img.classList.remove('grabbing');});
    cnt.addEventListener('wheel',function(e){if(!ov.classList.contains('active'))return;e.preventDefault();
      var f=e.deltaY<0?1.15:0.87;sc=Math.max(0.3,Math.min(8,sc*f));img.style.transform='scale('+sc+') translate('+px+'px,'+py+'px)';},{passive:false});
    var ld=0;cnt.addEventListener('touchstart',function(e){if(e.touches.length===2){ld=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}
      else if(e.touches.length===1){dr=true;sx=e.touches[0].clientX/sc-px;sy=e.touches[0].clientY/sc-py;}});
    cnt.addEventListener('touchmove',function(e){e.preventDefault();if(e.touches.length===2){var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      if(ld>0){sc=Math.max(0.3,Math.min(8,sc*(d/ld)));img.style.transform='scale('+sc+') translate('+px+'px,'+py+'px)';}ld=d;}
      else if(e.touches.length===1&&dr){px=e.touches[0].clientX/sc-sx;py=e.touches[0].clientY/sc-sy;img.style.transform='scale('+sc+') translate('+px+'px,'+py+'px)';}},{passive:false});
    cnt.addEventListener('touchend',function(){dr=false;ld=0;});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&ov.classList.contains('active'))closeArtifactOverlay();});
    if(TAGEDIT){
      window._ovTagUrl='';
      window.ovLoadTags=function(u){window._ovTagUrl=u;var bar=document.getElementById('ovTagBar');if(bar)bar.style.display='flex';
        var st=document.getElementById('ovTagStatus');if(st)st.textContent='';
        fetch('/api/dm-admin/images/tags?url='+encodeURIComponent(u)).then(function(r){return r.json();}).then(function(d){
          if(!d.ok)return;var t=d.tags||{};
          var sel=document.getElementById('ovTagType');if(sel)sel.value=t.type||'Other';
          var ci=document.getElementById('ovTagCustom');if(ci)ci.value=(t.tags||[]).join(', ');
          var src=document.getElementById('ovTagSrc');if(src)src.textContent=t.source?('Source: '+t.source):'';
        }).catch(function(){});};
      window.ovSaveTags=function(){var st=document.getElementById('ovTagStatus');if(st)st.textContent='Saving...';
        var type=document.getElementById('ovTagType').value;
        var tags=document.getElementById('ovTagCustom').value.split(',').map(function(s){return s.trim();}).filter(Boolean);
        fetch('/api/dm-admin/images/tags',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:window._ovTagUrl,type:type,tags:tags})})
          .then(function(r){return r.json();}).then(function(d){if(st)st.textContent=d.ok?'Saved':(d.error||'Error');})
          .catch(function(e){if(st)st.textContent='Error';});};
    }
  })();
  </script>`;
}

module.exports = { mapOverlayBlock, artifactOverlayBlock };
