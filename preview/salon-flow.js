import { comicLine } from './core/gameplay/ComicFraming.js';
import { VIEW_NAMES } from './core/gameplay/HairScore.js';

const rasterURLs=new WeakMap();
function url(raster){
    if(rasterURLs.has(raster))return rasterURLs.get(raster);
    const c=document.createElement('canvas');c.width=c.height=raster.size;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(raster.rgba),raster.size,raster.size),0,0);
    const value=c.toDataURL();rasterURLs.set(raster,value);return value;
}
export function createSalonFlow(session,cancel,canvas){
    const canvasHome=canvas.parentElement;
    document.body.classList.add('business');
    document.querySelector('#styleTitle').textContent='理发大师';
    document.querySelector('#comb').textContent='手 / 梳理';
    const root=document.createElement('div');root.className='salon-flow';
    root.innerHTML=`<aside class="reference-card" hidden><span class="eyebrow">客人的灵感</span><img class="reference-photo" alt="造型灵感参考照片"><strong class="reference-name"></strong><button class="reference-open">查看目标</button></aside>
    <button class="finish-hair" hidden>完成理发 <span>→</span></button>
    <div class="flow-overlay" hidden><section class="story-paper" role="dialog" aria-modal="true" aria-label="理发店营业流程" tabindex="-1"></section></div>
    <div class="shop-tag"><span class="shop-dot"></span><span class="shop-state">今日营业</span></div>`;
    document.querySelector('main').append(root);
    const card=root.querySelector('.reference-card'),overlay=root.querySelector('.flow-overlay'),paper=root.querySelector('.story-paper'),finish=root.querySelector('.finish-hair');
    let revision=-1,opened=false,resultView=0,mood='',photoOrder='';
    const photo=(image)=>{image.src=`/references/${session.order.id}.jpg`;image.onerror=()=>{image.onerror=null;image.alt='参考照片暂不可用';};};
    const image=(raster,alt,cls='')=>`<img class="${cls}" src="${url(raster)}" alt="${alt}">`;
    function closeReference(){opened=false;refresh(true);}
    function refresh(force=false){
        if(!force&&revision===session.revision)return;revision=session.revision;
        const s=session,order=s.order,comic=['arrival','request','ready'].includes(s.phase);
        card.hidden=!s.canStyle||opened;finish.hidden=!s.canStyle||opened;overlay.hidden=s.canStyle&&!opened;
        document.querySelector('.bottom-controls').hidden=!s.canStyle||opened;
        if(photoOrder!==order.id){photo(card.querySelector('img'));photoOrder=order.id;}
        card.querySelector('.reference-name').textContent=order.referenceName;
        if(!comic||opened)canvasHome.append(canvas);
        paper.classList.toggle('comic-paper',comic&&!opened);
        paper.classList.toggle('result-paper',s.phase==='result'&&!opened);
        if(overlay.hidden)return;
        cancel();
        if(opened){
            paper.innerHTML=`<div class="paper-heading"><span class="eyebrow">发型参考册</span><button class="close-reference" aria-label="返回理发">×</button></div><h2>${order.referenceName}<small>${order.title}</small></h2>
            <div class="reference-detail"><img class="detail-photo" alt="${order.referenceName}发型参考照片"><blockquote>“${order.request}”</blockquote></div>
            <p class="photo-credit">${order.credit}<br><a href="/references/credits.html" target="_blank" rel="noopener">照片来源与许可</a></p>
            <button class="primary close-reference">继续理发 <span>→</span></button>`;
            photo(paper.querySelector('.detail-photo'));paper.querySelectorAll('.close-reference').forEach(b=>b.onclick=closeReference);
        } else if(comic){
            const step=['arrival','request','ready'].indexOf(s.phase);
            if(!paper.querySelector('.comic-model')){
            paper.innerHTML=`<div class="paper-heading"><span class="eyebrow">理发大师 / 营业日记</span><span class="customer-number">第 ${s.customer} 位客人</span></div>
            <div class="live-comic-panel">
                <div class="comic-model" aria-label="漫画中的完整三维角色"></div>
                <div class="comic-speech with-photo"><span class="speaker">客人</span><p aria-live="polite"></p><img class="speech-photo" alt="客人想要的造型灵感参考照片" hidden></div>
            </div>
            <div class="comic-tap-hint"></div>`;
            paper.querySelector('.comic-model').append(canvas);
            photo(paper.querySelector('.speech-photo'));
            }
            paper.querySelector('.comic-speech p').textContent=comicLine(step,order.request);
            paper.querySelector('.speech-photo').hidden=step!==1;
            paper.querySelector('.comic-tap-hint').textContent=step===2?'点击屏幕，开始理发':'点击屏幕，继续对话';
        } else if(s.phase==='settling'){
            paper.innerHTML='<div class="settling"><span class="eyebrow">最后整理</span><h2>看看新造型…</h2><p>正在对照各个角度</p><div class="settling-line"></div></div>';
        } else if(s.result){
            const r=s.result;
            paper.innerHTML=`<div class="paper-heading"><span class="eyebrow">理发大师 / 作品回顾</span><span>第 ${s.customer} 位客人</span></div>
            <div class="result-heading"><div><h2>${r.total>=70?'很有感觉！':'下一次会更好。'}</h2><span class="stars">${'★'.repeat(r.stars)+'☆'.repeat(3-r.stars)}</span></div><div class="score-number">${r.total}<small>/ 100</small></div></div>
            <div class="result-pair"><figure><img class="result-reference" alt="${order.referenceName}发型参考照片"><figcaption>${order.referenceName}</figcaption></figure><figure>${image(s.getResultPortrait(resultView),'玩家完成发型','result-work')}<figcaption>你的作品</figcaption></figure></div>
            <div class="result-angles" aria-label="查看作品角度">${VIEW_NAMES.map((name,i)=>`<button data-view="${i}" aria-pressed="${i===resultView}">${name}</button>`).join('')}</div>
            <div class="score-breakdown">${[['外形',r.silhouette],['长度',r.length],['走向',r.direction]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong><div class="score-bar"><i style="width:${value}%"></i></div></div>`).join('')}</div>
            <p class="result-feedback">${r.feedback}</p><div class="result-actions"><button class="retry">再试一次</button><button class="primary next-customer">下一位客人 <span>→</span></button></div>`;
            photo(paper.querySelector('.result-reference'));
            paper.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
                const view=Number(b.dataset.view);if(view===resultView)return;resultView=view;
                paper.querySelector('.result-work').src=url(s.getResultPortrait(resultView));
                paper.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.view)===resultView)));
            });
            paper.querySelector('.retry').onclick=()=>{cancel();s.retry();refresh();};
            paper.querySelector('.next-customer').onclick=()=>{cancel();resultView=0;s.nextCustomer();refresh();};
        }
        paper.focus({preventScroll:true});
    }
    card.querySelector('button').onclick=()=>{cancel();opened=true;refresh(true);};
    finish.onclick=()=>{cancel();session.finish();refresh();};
    function advanceDialogue(){
        if(opened||!['arrival','request','ready'].includes(session.phase))return;
        cancel();session.advanceComic();refresh();
    }
    overlay.addEventListener('click',e=>{
        if(opened||!['arrival','request','ready'].includes(session.phase))return;
        e.preventDefault();e.stopPropagation();advanceDialogue();
    });
    window.addEventListener('keydown',e=>{
        if(!opened&&['arrival','request','ready'].includes(session.phase)&&['Space','Enter'].includes(e.code)){
            e.preventDefault();if(!e.repeat)advanceDialogue();return;
        }
        if(e.code==='Escape'&&opened){closeReference();return;}
        if(e.code==='Tab'&&!overlay.hidden){const buttons=[...paper.querySelectorAll('button,a')];if(!buttons.length){e.preventDefault();return;}const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===paper)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===paper)){e.preventDefault();first.focus();}}
    });
    refresh();return {refresh,comicActive:()=>!opened&&['arrival','request','ready'].includes(session.phase),blocksInput:()=>opened||!session.canStyle,updateMood(){
        const next={neutral:'专心等待',happy:'心情不错',surprised:'有点惊讶',sad:'有些失落',angry:'不太满意'}[session.emotion];
        const text=session.canStyle?`第 ${session.customer} 位客人 · ${next}`:'今日营业';if(text!==mood){root.querySelector('.shop-state').textContent=text;mood=text;}
    }};
}
