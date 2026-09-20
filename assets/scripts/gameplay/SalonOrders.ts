import { HairStyle } from '../core/HairstyleCatalog';

export interface SalonOrder {
    id: string; kind: 'celebrity' | 'animal'; referenceName: string; title: string; style: HairStyle; request: string;
    bottom: number; side: number; top?: number; crestHalfWidth?: number; rootHeight?: number; credit: string;
}
/** 照片提供造型灵感；目标由对应初始发型真实剪切生成，不改角色身份。 */
export const SALON_ORDERS: readonly SalonOrder[] = [
    { kind:'celebrity',id:'bruce-lee',referenceName:'李小龙',title:'功夫齐刘海',style:'bob',request:'想要李小龙那样利落的齐刘海！两侧和后面修短，打不过别人，发型先不能乱。',bottom:-.12,side:.67,credit:"National General Pictures · PD-US-no-notice · Wikimedia Commons" },
    { kind:'celebrity',id:'jackie-chan',referenceName:'成龙',title:'大哥自然中分',style:'curtains',request:'照成龙这样留个自然中分。两边别垂那么长，我一转头，它们比我先到！',bottom:-.23,side:.73,credit:"Georges Biard · CC BY-SA 3.0 · Wikimedia Commons" },
    { kind:'celebrity',id:'marilyn-monroe',referenceName:'玛丽莲·梦露',title:'复古蓬松短卷',style:'waves',request:'想要梦露的蓬松短卷！保留顶部，把下面收短。现在这两边像刚炸好的油条。',bottom:-.30,side:.85,credit:"Gene Kornman · PD-US-not-renewed · Wikimedia Commons" },
    { kind:'celebrity',id:'stephen-chow',referenceName:'周星驰',title:'喜剧主角刘海',style:'long',request:'帮我修成星爷照片里的短刘海感觉。后面剪短些，我是来当主角的，不是来演拖把的！',bottom:-.08,side:.65,credit:"Pak Cheng (talk)\n\nOriginal uploader was Pak Cheng at en.wikipedia · Public domain · Wikimedia Commons" },
    { kind:'celebrity',id:'andy-lau',referenceName:'刘德华',title:'精神利落背头',style:'quiff',request:'想要华仔这样利落的后梳轮廓。两侧和后面收紧，别让刘海替我跟人握手。',bottom:-.10,side:.64,top:.74,credit:"mR.Hom · CC BY 2.5 · Wikimedia Commons" },
    { kind:'celebrity',id:'chow-yun-fat',referenceName:'周润发',title:'大哥蓬松背头',style:'quiff',request:'照发哥这样，顶部留蓬松，边上修利落。气场可以两米八，头发不用两米八！',bottom:-.08,side:.62,top:.78,credit:"alotofmillion · CC BY-SA 3.0 · Wikimedia Commons" },
    { kind:'celebrity',id:'jay-chou',referenceName:'周杰伦',title:'舞台中分刘海',style:'curtains',request:'想要周杰伦照片里的中分刘海。两侧后面修短，分缝留下，别剪到连我自己都找不到眼睛。',bottom:-.04,side:.65,credit:"娛樂星聞 · CC BY-SA 4.0 · Wikimedia Commons" },
    { kind:'celebrity',id:'aaron-kwok',referenceName:'郭富城',title:'舞王高耸背头',style:'quiff',request:'照郭富城这个高高的背头修。顶部别压塌，两侧收窄，我转圈的时候不想靠头发扫地。',bottom:-.12,side:.58,top:.70,credit:"Dick Thomas Johnson from Tokyo, Japan · CC BY 2.0 · Wikimedia Commons" },
    { kind:'celebrity',id:'jacky-cheung',referenceName:'张学友',title:'歌神清爽侧分',style:'asymmetric',request:'想要张学友那样清爽的侧分。修短边上，顶部别推平，我唱高音靠嗓子，不靠避雷针。',bottom:-.06,side:.59,top:.74,credit:"wannafly · CC BY-SA 3.0 · Wikimedia Commons" },
    { kind:'celebrity',id:'nicholas-tse',referenceName:'谢霆锋',title:'锋利短碎发',style:'spiky',request:'照谢霆锋这样修成精神的短碎发。尖刺留一点，太长的削短，不然进门都得侧着走。',bottom:-.06,side:.62,top:.80,credit:"GEM_Ady (GEM_brilliant) · CC BY 2.5 · Wikimedia Commons" },
    { kind:'celebrity',id:'eason-chan',referenceName:'陈奕迅',title:'蓬松小卷头',style:'afro',request:'喜欢陈奕迅照片里蓬松的小卷！这团太大了，四周和顶部修小一圈，别把云朵剪成停机坪。',bottom:-.12,side:.65,top:.60,credit:"GEM_Ady (GEM_brilliant) · CC BY 2.5 · Wikimedia Commons" },
    { kind:'celebrity',id:'tony-leung',referenceName:'梁朝伟',title:'自然侧分短发',style:'lob',request:'照梁朝伟这样自然地侧分。两边修干净就好，眼神负责深情，头发负责别挡路。',bottom:-.10,side:.64,top:.81,credit:"Dick Thomas Johnson from Tokyo, Japan · CC BY 2.0 · Wikimedia Commons" },
    { kind:'celebrity',id:'takeshi-kaneshiro',referenceName:'金城武',title:'随性蓬松后梳',style:'quiff',request:'想要金城武那种自然后梳的感觉。后颈和两侧收短，现在头发比我的自我介绍还长。',bottom:-.19,side:.68,top:.77,credit:"Jens-Olaf Walter · CC BY-SA 2.0 · Wikimedia Commons" },
    { kind:'celebrity',id:'elvis-presley',referenceName:'猫王',title:'摇滚飞机头',style:'quiff',request:'照猫王这个翘起来的飞机头！顶部留高，边上修窄。可以准备起飞，但别真把飞机剪没了。',bottom:-.16,side:.65,top:.65,credit:"Unknown authorUnknown author · Public domain · Wikimedia Commons" },
    { kind:'celebrity',id:'michael-jackson',referenceName:'迈克尔·杰克逊',title:'舞台蓬松卷发',style:'mane',request:'想要杰克逊照片里的蓬松卷发轮廓。保留顶部，两侧和后面剪短，让我倒着走时别踩到头发。',bottom:-.22,side:.78,top:.94,credit:"Matthew Rolston; Distributed by Epic Records · Public domain · Wikimedia Commons" },
    { kind:'celebrity',id:'david-beckham',referenceName:'贝克汉姆',title:'球星利落背头',style:'spiky',request:'照贝克汉姆这样修成向上的短发。削掉太长的尖刺、收紧两侧，踢球不能先被自己的头发判越位。',bottom:-.10,side:.60,top:.72,credit:"Soccer Aid for Unicef · CC BY 3.0 · Wikimedia Commons" },
    { kind:'celebrity',id:'rowan-atkinson',referenceName:'憨豆先生',title:'一本正经侧分',style:'lob',request:'想要憨豆先生那样规矩的短发。两侧后面收短，额前别盖住眉毛，它们还要负责表演！',bottom:-.05,side:.61,credit:"Eva Rinaldi · CC BY-SA 2.0 · Wikimedia Commons" },
    { kind:'celebrity',id:'audrey-hepburn',referenceName:'奥黛丽·赫本',title:'复古短刘海',style:'long',request:'喜欢赫本照片里的短刘海轮廓。先把两侧后面修短，刘海别全剃掉，我还没准备好演电灯泡。',bottom:.02,side:.60,credit:"Bud Fraker (1916-2002) [1] · Public domain · Wikimedia Commons" },
    { kind:'celebrity',id:'charlie-chaplin',referenceName:'卓别林',title:'默片绅士侧分',style:'asymmetric',request:'照卓别林照片里的侧分修利落。保留分向，两边别垂太长。这次只剪头发，小胡子不用赠送。',bottom:-.09,side:.63,credit:"Strauss-Peyton Studio · Public domain · Wikimedia Commons" },
    { kind:'celebrity',id:'will-smith',referenceName:'威尔·史密斯',title:'清爽短寸轮廓',style:'afro',request:'照威尔·史密斯这样剪短！顶部和四周都收紧，这团头发现在过安检要单独买张票。',bottom:-.02,side:.62,top:.55,credit:"TechCrunch · CC BY 2.0 · Wikimedia Commons" },
    { kind:'animal',id:'animal-horse',referenceName:'马',title:'骏马鬃毛头',style:'spiky',request:'老板，照这匹马剪！中间留高高一排，两边修短。我明天赶早班，想看起来跑得比较快。',bottom:-.12,side:.72,top:1.02,crestHalfWidth:.22,credit:"Claudia Feh · CC BY-SA 4.0 · Wikimedia Commons" },
    { kind:'animal',id:'animal-donkey',referenceName:'驴',title:'倔强小毛刷',style:'spiky',request:'就要这头驴的精神！中间留一撮短毛刷，两侧收干净。耳朵不用加，我已经很会听老板画饼了。',bottom:-.08,side:.66,top:.81,crestHalfWidth:.30,credit:"Dusan Bicanski · Public domain · Wikimedia Commons" },
    { kind:'animal',id:'animal-lion',referenceName:'狮子',title:'草原霸总鬃毛',style:'mane',request:'我要狮子这一圈鬃毛！脸边留蓬松，太长的发尾修齐。明天开会，争取一进门大家就安静。',bottom:-.46,side:.90,credit:"Giles Laurent · CC BY-SA 4.0 · Wikimedia Commons" },
    { kind:'animal',id:'animal-alpaca',referenceName:'羊驼',title:'羊驼头顶棉花糖',style:'afro',request:'照羊驼剪个头顶毛团！中间蓬松，两边收短。看起来要软乎乎，脾气这块我自己负责。',bottom:-.08,side:.64,top:.66,crestHalfWidth:.30,credit:"Kyle Flood from Victoria, British Columbia, Canada · CC BY-SA 2.0 · Wikimedia Commons" },
    { kind:'animal',id:'animal-sheep',referenceName:'绵羊',title:'行走的毛线团',style:'afro',request:'我要绵羊这种毛茸茸的一圈！四周稍微修小，别剃秃。我只是想睡个好觉，不想被织成毛衣。',bottom:-.20,side:.70,top:.61,credit:"Richard Bartz · CC BY-SA 2.5 · Wikimedia Commons" },
    { kind:'animal',id:'animal-hedgehog',referenceName:'刺猬',title:'请勿摸头短刺',style:'spiky',request:'照刺猬剪一头短刺！每撮长尖都削短，别全推平。以后谁想摸我头，都得先预约。',bottom:-.08,side:.71,rootHeight:.22,credit:"Jörg Hempel · CC BY-SA 2.0 de · Wikimedia Commons" },
];
