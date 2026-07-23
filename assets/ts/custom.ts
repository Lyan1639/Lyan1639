/**
 * 自定义功能脚本
 * 实现：修订记录、阅读进度、返回顶部、收藏夹、字体大小、标题返回、阅读进度条
 */

const STORAGE_PREFIX = 'lyan_blog_';

function escapeHtml(text: string): string {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

// ============================================
// Toast 提示工具
// ============================================
class Toast {
    private element: HTMLElement | null = null;
    private timer: number | null = null;

    show(message: string, duration: number = 2500) {
        if (!this.element) {
            this.element = document.createElement('div');
            this.element.className = 'toast';
            document.body.appendChild(this.element);
        }
        this.element.textContent = message;
        this.element.classList.add('show');
        if (this.timer) clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
            this.element?.classList.remove('show');
        }, duration);
    }
}

const toast = new Toast();

// ============================================
// 修订记录 - 相对时间 (Feature 2)
// ============================================
function formatRelativeTime(isoDate: string): string {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 30) return `${diffDays} 天前`;
    if (diffMonths < 12) return `${diffMonths} 个月前`;
    return `${diffYears} 年前`;
}

function updateRevisionTimes() {
    document.querySelectorAll('[data-lastmod]').forEach(el => {
        const isoDate = el.getAttribute('data-lastmod');
        if (!isoDate) return;
        el.textContent = formatRelativeTime(isoDate);
    });
}

// ============================================
// 阅读进度条 (Feature 5)
// ============================================
class ReadingProgressBar {
    private bar: HTMLElement | null = null;

    init() {
        if (this.bar) return;
        const container = document.createElement('div');
        container.id = 'reading-progress-container';
        this.bar = document.createElement('div');
        this.bar.id = 'reading-progress-bar';
        container.appendChild(this.bar);
        document.body.appendChild(container);

        window.addEventListener('scroll', this.update.bind(this), { passive: true });
    }

    private update() {
        if (!this.bar) return;
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight <= 0) {
            this.bar.style.width = '0%';
            return;
        }
        const progress = Math.min((scrollTop / docHeight) * 100, 100);
        this.bar.style.width = progress + '%';
    }

    getProgress(): number {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight <= 0) return 0;
        return Math.min((scrollTop / docHeight) * 100, 100);
    }
}

// ============================================
// 阅读位置保存/恢复 (Feature 5)
// ============================================
class ReadingPositionSaver {
    private static STORAGE_KEY = STORAGE_PREFIX + 'reading_positions';

    save() {
        if (window.location.pathname === '/') return;
        const progress = new ReadingProgressBar().getProgress();
        if (progress > 5) { // 只保存滚动超过 5% 的位置
            const positions = this.getPositions();
            positions[window.location.pathname] = {
                progress,
                timestamp: Date.now()
            };
            // 限制存储条目数
            const keys = Object.keys(positions);
            if (keys.length > 50) {
                const sorted = keys.sort((a, b) => positions[b].timestamp - positions[a].timestamp);
                while (sorted.length > 50) {
                    const oldKey = sorted.pop()!;
                    delete positions[oldKey];
                }
            }
            try {
                localStorage.setItem(ReadingPositionSaver.STORAGE_KEY, JSON.stringify(positions));
            } catch (e) {
                // localStorage full, silently fail
            }
        }
    }

    getPositions(): Record<string, { progress: number; timestamp: number }> {
        try {
            const data = localStorage.getItem(ReadingPositionSaver.STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch {
            return {};
        }
    }

    getSavedProgress(): number | null {
        const positions = this.getPositions();
        const pos = positions[window.location.pathname];
        return pos?.progress ?? null;
    }

    restore() {
        const progress = this.getSavedProgress();
        if (progress === null || progress < 5 || progress > 98) return;

        // 延迟显示恢复提示，等待页面渲染完成
        setTimeout(() => {
            this.showRestoreToast(progress);
        }, 1500);
    }

    private showRestoreToast(progress: number) {
        const existing = document.querySelector('.reading-progress-toast');
        if (existing) return;

        const toast = document.createElement('div');
        toast.className = 'reading-progress-toast show';
        toast.innerHTML = `
            <span>您上次读到 ~${Math.round(progress)}% 位置</span>
            <button class="restore-btn">继续阅读</button>
            <button class="dismiss-btn">✕</button>
        `;
        document.body.appendChild(toast);

        toast.querySelector('.restore-btn')?.addEventListener('click', () => {
            const scrollTarget = (progress / 100) * (document.documentElement.scrollHeight - window.innerHeight);
            window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        });

        toast.querySelector('.dismiss-btn')?.addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        });
    }

    clearCurrent() {
        const positions = this.getPositions();
        delete positions[window.location.pathname];
        localStorage.setItem(ReadingPositionSaver.STORAGE_KEY, JSON.stringify(positions));
    }
}

// ============================================
// 返回顶部按钮 (Feature 6)
// ============================================
class BackToTop {
    private btn: HTMLElement | null = null;

    init() {
        if (this.btn) return;
        this.btn = document.createElement('button');
        this.btn.id = 'back-to-top';
        this.btn.setAttribute('aria-label', '回到顶部');
        this.btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
        document.body.appendChild(this.btn);

        this.btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        window.addEventListener('scroll', this.toggle.bind(this), { passive: true });
    }

    private toggle() {
        if (!this.btn) return;
        if (window.scrollY > 300) {
            this.btn.classList.add('visible');
        } else {
            this.btn.classList.remove('visible');
        }
    }
}

// ============================================
// 全局返回按钮 (任意页面都可返回)
// ============================================
class GlobalBackButton {
    private btn: HTMLElement | null = null;
    private hiddenPages = ['/', '/page/bookmarks/'];

    init() {
        // 首页和特定页面不显示返回按钮
        if (this.hiddenPages.includes(window.location.pathname)) return;
        // 如果没有历史记录也不显示
        if (window.history.length <= 1) return;

        this.btn = document.createElement('button');
        this.btn.id = 'global-back-btn';
        this.btn.setAttribute('aria-label', '返回上一页');
        this.btn.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            <span>返回</span>
        `;

        this.btn.addEventListener('click', () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = '/';
            }
        });

        document.body.appendChild(this.btn);

        // 延迟显示，避免页面加载时闪烁
        setTimeout(() => {
            this.btn?.classList.add('visible');
        }, 100);

        // 滚动时隐藏/显示
        let scrollTimer: number | null = null;
        window.addEventListener('scroll', () => {
            if (!this.btn) return;
            this.btn.classList.remove('visible');
            if (scrollTimer) clearTimeout(scrollTimer);
            scrollTimer = window.setTimeout(() => {
                this.btn?.classList.add('visible');
            }, 300);
        }, { passive: true });
    }
}

// ============================================
// 收藏夹管理 (Feature 4)
// ============================================

// ============================================
// 字体大小调节 (Feature 9)
// ============================================
class FontSizeManager {
    private static STORAGE_KEY = STORAGE_PREFIX + 'font_size';
    private sizes = ['small', 'normal', 'large'] as const;
    private currentIndex = 1; // default: normal

    init() {
        const savedSize = this.getSavedSize();
        this.currentIndex = this.sizes.indexOf(savedSize);
        if (this.currentIndex === -1) this.currentIndex = 1;

        this.applySize(this.sizes[this.currentIndex]);
        this.createControls();
    }

    private getSavedSize(): string {
        try {
            return localStorage.getItem(FontSizeManager.STORAGE_KEY) || 'normal';
        } catch {
            return 'normal';
        }
    }

    private saveSize(size: string) {
        try {
            localStorage.setItem(FontSizeManager.STORAGE_KEY, size);
        } catch { /* ignore */ }
    }

    private applySize(size: string) {
        document.documentElement.classList.remove('font-size--small', 'font-size--large');
        if (size === 'small') {
            document.documentElement.classList.add('font-size--small');
        } else if (size === 'large') {
            document.documentElement.classList.add('font-size--large');
        }
    }

    private createControls() {
        const articleContent = document.querySelector('.article-content');
        if (!articleContent) return;

        const controls = document.createElement('div');
        controls.className = 'font-size-controls';

        const label = document.createElement('span');
        label.className = 'font-size-label';
        label.textContent = '字号';
        controls.appendChild(label);

        const labels = ['小', '中', '大'];
        this.sizes.forEach((size, index) => {
            const btn = document.createElement('button');
            btn.className = 'font-size-btn' + (index === this.currentIndex ? ' active' : '');
            btn.textContent = labels[index];
            btn.setAttribute('data-size', size);
            btn.addEventListener('click', () => {
                this.currentIndex = index;
                this.applySize(size);
                this.saveSize(size);
                controls.querySelectorAll('.font-size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            controls.appendChild(btn);
        });

        // 插入在文章内容前
        articleContent.parentNode?.insertBefore(controls, articleContent);
    }
}

// ============================================
// 二次点击标题收起文章 (Feature 11)
// ============================================
class ArticleTitleHandler {
    init() {
        const titleLink = document.querySelector('.article-title a');
        if (!titleLink) return;

        titleLink.addEventListener('click', (e) => {
            const href = titleLink.getAttribute('href');
            // 如果标题链接指向当前页面，则返回上一页
            if (href === window.location.pathname || href === '' || href === '#') {
                e.preventDefault();
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    window.location.href = '/';
                }
            }
            // 否则正常导航（允许标题链接指向其他页面）
        });
    }
}

// ============================================
// 赛博数据网络动态效果
// ============================================
class CyberNetwork {
    private particles: CyberParticle[] = [];
    private travelingDots: TravelingDot[] = [];
    private animFrameId: number = 0;
    private startTime: number = Date.now();
    private orbPositions: {x: number, y: number, radius: number}[] = [];
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;

    init() {
        this.createCanvas();
        this.initOrbPositions();
        this.initTravelingDots();
        this.animate();
    }

    private createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'cyber-canvas-layer';
        this.canvas.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;';
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d')!;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    private resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    private initOrbPositions() {
        // 主节点位置（匹配 CSS 中的光球位置）
        this.orbPositions = [
            {x: 0.25, y: 0.40, radius: 35},
            {x: 0.55, y: 0.35, radius: 40},
            {x: 0.75, y: 0.45, radius: 30},
            {x: 0.15, y: 0.55, radius: 20},
            {x: 0.40, y: 0.50, radius: 18},
            {x: 0.65, y: 0.55, radius: 15},
            {x: 0.88, y: 0.50, radius: 22},
        ];
    }

    private initTravelingDots() {
        // 柱位置（匹配 CSS）
        const pillarXs = [0.05, 0.12, 0.22, 0.30, 0.38, 0.45, 0.52, 0.60, 0.68, 0.78, 0.85, 0.92, 0.97];
        for (let i = 0; i < pillarXs.length; i++) {
            this.travelingDots.push(new TravelingDot(pillarXs[i]));
        }
    }

    private getOrbPixels(): {x: number, y: number, radius: number}[] {
        const w = this.canvas?.width || window.innerWidth;
        const h = this.canvas?.height || window.innerHeight;
        return this.orbPositions.map(o => ({
            x: o.x * w,
            y: o.y * h,
            radius: o.radius
        }));
    }

    private animate() {
        if (!this.ctx || !this.canvas) return;

        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const elapsed = (Date.now() - this.startTime) / 1000;

        ctx.clearRect(0, 0, w, h);

        // 更新 traveling dots
        const orbs = this.getOrbPixels();
        this.travelingDots.forEach(dot => dot.update(ctx, w, h, elapsed));

        // 更新粒子
        const elapsedSinceLastParticle = elapsed - (this as any)._lastParticleTime || 0;
        if (this.particles.length < 35 && elapsedSinceLastParticle > 0.3) {
            this.particles.push(new CyberParticle(w, h));
            (this as any)._lastParticleTime = elapsed;
        }

        this.particles = this.particles.filter(p => {
            p.update(ctx, w, h, orbs, elapsed);
            return p.alive;
        });

        // 继续下一帧
        this.animFrameId = requestAnimationFrame(() => this.animate());
    }
}

class TravelingDot {
    private xRatio: number;
    private y: number = 0;
    private speed: number;
    private direction: 1 | -1 = 1;
    private size: number;
    private brightness: number = 0;

    constructor(xRatio: number) {
        this.xRatio = xRatio;
        this.y = 0.2 + Math.random() * 0.4;
        this.speed = 0.1 + Math.random() * 0.2;
        this.size = 1.5 + Math.random() * 1.5;
        this.direction = Math.random() > 0.5 ? 1 : -1;
    }

    update(ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number) {
        // 上下游走
        this.y += this.speed * 0.003 * this.direction;
        if (this.y > 0.8 || this.y < 0.1) this.direction *= -1 as -1 | 1;

        // 亮度呼吸
        this.brightness = 0.5 + 0.5 * Math.sin(elapsed * 2 + this.xRatio * 10);

        const x = this.xRatio * w;
        const y = this.y * h;

        // 光晕
        const glow = ctx.createRadialGradient(x, y, 0, x, y, this.size * 4);
        glow.addColorStop(0, `rgba(180, 230, 255, ${0.6 * this.brightness})`);
        glow.addColorStop(0.3, `rgba(140, 210, 255, ${0.3 * this.brightness})`);
        glow.addColorStop(1, 'rgba(140, 210, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, this.size * 4, 0, Math.PI * 2);
        ctx.fill();

        // 核心白点
        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * this.brightness})`;
        ctx.beginPath();
        ctx.arc(x, y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

class CyberParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
    life: number;
    maxLife: number;
    alive: boolean = true;

    constructor(w: number, h: number) {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = -0.1 - Math.random() * 0.2;
        this.size = 0.8 + Math.random() * 1.5;
        this.opacity = 0.2 + Math.random() * 0.4;
        this.maxLife = 120 + Math.random() * 240;
        this.life = 0;
    }

    update(ctx: CanvasRenderingContext2D, w: number, h: number, orbs: {x: number, y: number, radius: number}[], elapsed: number) {
        this.life++;
        this.x += this.vx;
        this.y += this.vy;

        // 缓慢漂移
        this.vx += (Math.random() - 0.5) * 0.02;

        // 边界环绕
        if (this.x < 0) this.x = w;
        if (this.x > w) this.x = 0;
        if (this.y < -20) { this.y = h + 10; this.alive = false; }
        if (this.y > h + 20) { this.y = -10; }

        // 检查是否靠近光球 → 消散
        let nearOrb = false;
        for (const orb of orbs) {
            const dx = this.x - orb.x;
            const dy = this.y - orb.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < orb.radius * 1.5) {
                nearOrb = true;
                break;
            }
        }

        if (nearOrb) {
            this.opacity -= 0.02;
            this.size += 0.1;
            if (this.opacity <= 0 || this.life > this.maxLife) {
                this.alive = false;
                return;
            }
        }

        // 生命周期衰减
        if (this.life > this.maxLife) {
            this.opacity -= 0.01;
            if (this.opacity <= 0) {
                this.alive = false;
                return;
            }
        }

        // 亮度起伏
        const flicker = 0.7 + 0.3 * Math.sin(elapsed * 3 + this.x * 0.01 + this.y * 0.01);

        // 绘制
        const alpha = this.opacity * flicker;
        ctx.fillStyle = `rgba(200, 235, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        // 微光晕
        if (this.size > 1.2) {
            const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 3);
            g.addColorStop(0, `rgba(180, 230, 255, ${alpha * 0.3})`);
            g.addColorStop(1, 'transparent');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// ============================================
// 初始化所有功能
// ============================================
function initAll() {
    // 创建粒子层
    const bubbles = document.createElement('div');
    bubbles.className = 'cyber-particles';
    document.body.appendChild(bubbles);

    // Feature 2: 修订记录相对时间
    updateRevisionTimes();

    // Feature 5: 阅读进度条
    const progressBar = new ReadingProgressBar();
    progressBar.init();

    // Feature 5: 阅读位置保存/恢复
    const positionSaver = new ReadingPositionSaver();
    positionSaver.restore();

    // 保存阅读位置（滚动时防抖保存）
    let saveTimer: number | null = null;
    window.addEventListener('scroll', () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
            positionSaver.save();
        }, 1000);
    }, { passive: true });

    // 页面关闭/隐藏前保存位置
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            positionSaver.save();
        }
    });

    // Feature 6: 返回顶部
    const backToTop = new BackToTop();
    backToTop.init();

    // 收藏夹页面初始化（只保留搜索功能）
    const bmApp = document.getElementById('lyan-bookmarks-app');
    if (bmApp) {
        initSimpleBookmarks(bmApp);
    }

    // 全局返回按钮
    const backBtn = new GlobalBackButton();
    backBtn.init();

    // Feature 9: 字体大小
    const fontSizeMgr = new FontSizeManager();
    fontSizeMgr.init();

    // Feature 11: 标题返回
    const titleHandler = new ArticleTitleHandler();
    titleHandler.init();

    // 赛博数据网络动态效果（Canvas 粒子 + 游走光点）
    const cyberNet = new CyberNetwork();
    cyberNet.init();

    // 主页搜索
    initHomeSearch();

    // 新功能
    initTagFilter();
    initWelcomeToast();
    initLikeButton();
    initReadingCount();
    initShareButton();
    initListShareButtons();
    initListCounts();
    initComments();
    initHomeMessageBoard();
}

// ============================================
// 简化收藏夹页面 — 只展示预置收藏夹 + 搜索
// ============================================
function initSimpleBookmarks(app: HTMLElement) {
    // 预置数据
    const collections = [
        {
            name: '🎬 科幻电影',
            items: [
                { title: '《流浪地球3》AI 影评', url: '/post/hello-world/' },
                { title: 'First Note:一篇ai废话', url: '/post/first-note/' }
            ]
        },
        {
            name: '💡 AI 探索',
            items: [
                { title: '《流浪地球3》AI 影评', url: '/post/hello-world/' }
            ]
        }
    ];

    const container = app.querySelector('.bookmarks-content') || app;
    container.innerHTML = `
        <div class="bookmarks-simple-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input type="text" id="simple-bm-search" placeholder="搜索收藏的文章..." autocomplete="off">
        </div>
        <div class="bookmarks-simple-grid" id="simple-bm-grid">
            ${collections.map(col => `
                <div class="bm-simple-collection" data-name="${col.name.toLowerCase()}">
                    <div class="bm-collection-header">${col.name} <span class="bm-count">${col.items.length}</span></div>
                    ${col.items.map(item => `
                        <a href="${item.url}" class="bm-simple-item" data-title="${item.title.toLowerCase()}">${item.title}</a>
                    `).join('')}
                </div>
            `).join('')}
        </div>
        <div id="simple-bm-empty" class="bookmark-empty" style="display:none;">无匹配结果</div>
    `;

    // 搜索过滤
    const searchInput = document.getElementById('simple-bm-search') as HTMLInputElement;
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase().trim();
            let hasVisible = false;
            document.querySelectorAll('.bm-simple-item').forEach(el => {
                const title = el.getAttribute('data-title') || '';
                const match = !q || title.includes(q);
                (el as HTMLElement).style.display = match ? '' : 'none';
                if (match) hasVisible = true;
            });
            document.querySelectorAll('.bm-simple-collection').forEach(el => {
                const hasVisibleChild = Array.from(el.querySelectorAll('.bm-simple-item')).some(
                    item => (item as HTMLElement).style.display !== 'none'
                );
                (el as HTMLElement).style.display = hasVisibleChild ? '' : 'none';
                if (hasVisibleChild) hasVisible = true;
            });
            const empty = document.getElementById('simple-bm-empty');
            if (empty) empty.style.display = hasVisible ? 'none' : 'block';
        });
    }
}

// ============================================
// 主页搜索 + 布局切换
// ============================================
function initHomeSearch() {
    if (document.documentElement.dataset.page !== 'home') return;
    const main = document.querySelector('.main');
    const firstChild = main?.firstElementChild;
    if (!main) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'home-toolbar';
    toolbar.innerHTML = `
        <div class="home-search">
            <svg class="home-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input type="text" class="home-search-input" placeholder="搜索文章标题..." autocomplete="off">
        </div>
        <div class="layout-toggle">
            <button class="layout-btn card-layout active" title="卡片视图">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>
            </button>
            <button class="layout-btn list-layout" title="列表视图">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
            </button>
        </div>
    `;
    main.insertBefore(toolbar, firstChild);

    // 搜索
    const input = toolbar.querySelector('.home-search-input') as HTMLInputElement;
    input.addEventListener('input', () => {
        const q = input.value.toLowerCase().trim();
        document.querySelectorAll('.article-list article').forEach(card => {
            const title = card.querySelector('.article-title a')?.textContent?.toLowerCase() || '';
            card.classList.toggle('search-hidden', q !== '' && !title.includes(q));
        });
    });

    // 布局切换
    const cardBtn = toolbar.querySelector('.card-layout') as HTMLElement;
    const listBtn = toolbar.querySelector('.list-layout') as HTMLElement;
    const list = document.querySelector('.article-list');

    cardBtn.addEventListener('click', () => {
        cardBtn.classList.add('active'); listBtn.classList.remove('active');
        list?.classList.remove('compact-view');
        localStorage.setItem('lyan_blog_layout', 'card');
    });
    listBtn.addEventListener('click', () => {
        listBtn.classList.add('active'); cardBtn.classList.remove('active');
        list?.classList.add('compact-view');
        localStorage.setItem('lyan_blog_layout', 'list');
    });

    // 恢复偏好
    try {
        if (localStorage.getItem('lyan_blog_layout') === 'list') {
            listBtn.click();
        }
    } catch {}
}

// ============================================
// 标签筛选（点击标签切换）
// ============================================
function initTagFilter() {
    if (document.documentElement.dataset.page !== 'home') return;

    // 拦截标签链接点击 → 转为筛选
    document.querySelectorAll('.article-tags a').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const tag = a.textContent?.toLowerCase().trim();
            if (!tag) return;

            // 高亮点中的标签
            document.querySelectorAll('.article-tags a').forEach(el => el.classList.remove('tag-active'));
            a.classList.add('tag-active');

            document.querySelectorAll('.article-list article').forEach(card => {
                const tags = Array.from(card.querySelectorAll('.article-tags a')).map(
                    el => el.textContent?.toLowerCase() || ''
                );
                card.classList.toggle('search-hidden', !tags.some(t => t.includes(tag)));
            });

            // 清除搜索框
            const input = document.querySelector('.home-search-input') as HTMLInputElement;
            if (input) input.value = '';
        });
    });
}

// ============================================
// 点赞功能
// ============================================
function initLikeButton() {
    const article = document.querySelector('.main-article');
    if (!article) return;
    const url = window.location.pathname;
    const KEY = 'lyan_blog_likes';

    let data: Record<string, number> = {};
    try { data = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}

    const likedKey = 'lyan_blog_liked_' + url.replace(/\//g, '_');
    const liked = localStorage.getItem(likedKey) === '1';

    if (!data[url]) data[url] = 0;
    const count = data[url];

    const btn = document.createElement('button');
    btn.className = 'like-btn' + (liked ? ' liked' : '');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span>${count > 0 ? count : '点赞'}</span>`;

    btn.addEventListener('click', () => {
        const isLiked = localStorage.getItem(likedKey) === '1';
        if (isLiked) {
            localStorage.removeItem(likedKey);
            if (data[url] > 0) data[url]--;
            btn.classList.remove('liked');
            btn.querySelector('svg')!.setAttribute('fill', 'none');
        } else {
            localStorage.setItem(likedKey, '1');
            data[url] = (data[url] || 0) + 1;
            btn.classList.add('liked');
            btn.querySelector('svg')!.setAttribute('fill', 'currentColor');
        }
        localStorage.setItem(KEY, JSON.stringify(data));
        btn.querySelector('span')!.textContent = data[url] > 0 ? String(data[url]) : '点赞';
    });

    const footer = article.querySelector('.article-footer');
    if (footer) footer.appendChild(btn);
}

// ============================================
// 阅读量
// ============================================
function initReadingCount() {
    const el = document.getElementById('reading-count');
    if (!el) return;
    const KEY = 'lyan_blog_views';
    let data: Record<string, number> = {};
    try { data = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
    const url = window.location.pathname;
    data[url] = (data[url] || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(data));
    el.textContent = data[url] + ' 阅读';
}

// ============================================
// 分享按钮
// ============================================
function initShareButton() {
    const article = document.querySelector('.main-article');
    if (!article) return;
    const url = window.location.href;
    const title = document.title;

    const btn = document.createElement('button');
    btn.className = 'share-btn';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg><span>分享</span>`;

    btn.addEventListener('click', () => {
        if (navigator.share) {
            navigator.share({ title, url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url).then(() => {
                const toast = document.querySelector('.toast') as HTMLElement;
                if (toast) { toast.textContent = '链接已复制'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2000); }
            }).catch(() => {});
        }
    });

    const footer = article.querySelector('.article-footer');
    if (footer) {
        const like = footer.querySelector('.like-btn');
        if (like) like.before(btn);
        else footer.appendChild(btn);
    }
}

// ============================================
// 欢迎弹窗
// ============================================
function initWelcomeToast() {
    try {
        if (localStorage.getItem('lyan_blog_visited')) return;
        localStorage.setItem('lyan_blog_visited', '1');
    } catch { return; }

    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    overlay.innerHTML = `
        <div class="welcome-modal">
            <div class="welcome-icon">👋</div>
            <h2>欢迎来到 Lyan 的博客</h2>
            <p>记录、分享、成长 —— 在这里探索技术、电影与生活的无限可能。</p>
            <button class="welcome-btn">开始探索</button>
        </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 300);

    const close = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 400);
    };
    overlay.querySelector('.welcome-btn')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

// ============================================
// 主页文章列表显示阅读量和点赞
// ============================================
function initListCounts() {
    if (document.documentElement.dataset.page !== 'home') return;
    let views: Record<string, number> = {};
    let likes: Record<string, number> = {};
    try { views = JSON.parse(localStorage.getItem('lyan_blog_views') || '{}'); } catch {}
    try { likes = JSON.parse(localStorage.getItem('lyan_blog_likes') || '{}'); } catch {}

    document.querySelectorAll('.article-list article').forEach(card => {
        const link = card.querySelector('.article-title a');
        if (!link) return;
        const href = link.getAttribute('href') || '';
        const url = href.startsWith('http') ? new URL(href).pathname : href;

        const meta = card.querySelector('.article-meta');
        if (!meta) return;
        const countEl = document.createElement('span');
        countEl.className = 'list-counts';
        const v = views[url] || 0;
        const l = likes[url] || 0;
        if (v || l) {
            countEl.textContent = (v ? `${v} 阅读` : '') + (v && l ? ' · ' : '') + (l ? `${l} 赞` : '');
            meta.appendChild(countEl);
        }
    });
}

// ============================================
// 主页文章列表分享按钮
// ============================================
function initListShareButtons() {
    if (document.documentElement.dataset.page !== 'home') return;
    document.querySelectorAll('.article-list article').forEach(card => {
        const title = card.querySelector('.article-title a')?.textContent?.trim() || '';
        const href = card.querySelector('.article-title a')?.getAttribute('href') || '/';
        const fullUrl = window.location.origin + href;

        const shareBtn = document.createElement('button');
        shareBtn.className = 'share-btn list-share-btn';
        shareBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>`;
        shareBtn.title = '分享';

        shareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (navigator.share) {
                navigator.share({ title, url: fullUrl }).catch(() => {});
            } else {
                navigator.clipboard.writeText(fullUrl).then(() => {
                    const t = document.querySelector('.toast') as HTMLElement;
                    if (t) { t.textContent = '链接已复制'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }
                }).catch(() => {});
            }
        });

        const meta = card.querySelector('.article-meta');
        if (meta) meta.appendChild(shareBtn);
    });
}

// ============================================
// 主页留言板（QQ空间弹幕 · 从右向左飘过）
// ============================================
function initHomeMessageBoard() {
    if (document.documentElement.dataset.page !== 'home') return;
    const toolbar = document.querySelector('.home-toolbar');
    if (!toolbar) return;

    interface Msg { name: string; text: string; time: number; color?: string; }
    const KEY = 'lyan_blog_messages';
    const COL_KEY = 'lyan_blog_bubble_color';
    let messages: Msg[] = [];
    try { messages = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
    let savedColor = '';
    try { savedColor = localStorage.getItem(COL_KEY) || ''; } catch {}

    const FLD_KEY = 'lyan_blog_board_folded';
    let folded = false;
    try { folded = localStorage.getItem(FLD_KEY) === '1'; } catch {}

    const board = document.createElement('section');
    board.className = 'home-message-board' + (folded ? ' folded' : '');
    board.innerHTML = `
        <div class="board-bar">
            <span class="board-bar-l">💬 留言板 <span class="board-bar-cnt">${messages.length}</span></span>
            <span class="board-bar-r">
                <button class="board-fold">${folded ? '▶ 展开' : '▼ 收起'}</button>
            </span>
        </div>
        <div class="board-inner">
            <div class="danmaku-stage" id="danmaku-stage">
                <div class="danmaku-shade"></div>
            </div>
            <div class="board-form">
                <input type="color" class="bf-color" value="${savedColor || '#8b7dd8'}" title="气泡颜色">
                <input class="bf-name" placeholder="昵称" maxlength="15">
                <input class="bf-text" placeholder="写一条留言…" maxlength="200">
                <button class="bf-submit">发布</button>
            </div>
        </div>
    `;
    toolbar.after(board);

    const stage = board.querySelector('.danmaku-stage') as HTMLElement;
    let danmakuTimers: number[] = [];

    function fireDanmaku() {
        // 清除旧定时器
        danmakuTimers.forEach(t => clearTimeout(t));
        danmakuTimers = [];

        if (!stage || !messages.length) return;

        // 随机打乱顺序播发
        const shuffled = [...messages].sort(() => Math.random() - 0.5);
        // 同时最多显示 5 条
        const active = Math.min(shuffled.length, 5);
        const usedTracks: number[] = [];

        for (let i = 0; i < active; i++) {
            (function(idx) {
                const delay = idx * 1200 + Math.random() * 800; // 每条间隔错开
                const timer = window.setTimeout(() => {
                    const m = shuffled[idx];
                    if (!m) return;

                    const el = document.createElement('div');
                    el.className = 'danmaku-bubble';
                    const bubbleColor = m.color || savedColor || '#8b7dd8';
                    el.innerHTML = `<strong style="color:${bubbleColor}">${escapeHtml(m.name)}</strong> ${escapeHtml(m.text)}`;
                    el.style.setProperty('--bubble-color', bubbleColor);

                    // 随机轨道（0~4 垂直位置）
                    let lane: number;
                    do { lane = Math.floor(Math.random() * 5); } while (usedTracks.includes(lane) && usedTracks.length < 5);
                    usedTracks.push(lane);

                    const topOffset = 4 + lane * 20;
                    el.style.top = topOffset + 'px';

                    // 持续时间基于文字长度（6~10秒）
                    const duration = 6 + Math.min(m.text.length / 12, 4);
                    el.style.animationDuration = duration + 's';

                    // 随机轻微延迟让每条不同步
                    el.style.animationDelay = (Math.random() * 0.5) + 's';

                    stage.appendChild(el);

                    // 动画结束后移除
                    el.addEventListener('animationend', () => el.remove());
                }, delay);
                danmakuTimers.push(timer);
            })(i);
        }
    }

    // 持续循环播发
    let cycleTimer = 0;
    function startDanmakuLoop() {
        stopDanmakuLoop();
        fireDanmaku();
        // 每 6~8 秒重新发射一轮
        cycleTimer = window.setInterval(fireDanmaku, 7000 + Math.random() * 2000);
    }

    function stopDanmakuLoop() {
        danmakuTimers.forEach(t => clearTimeout(t));
        danmakuTimers = [];
        if (cycleTimer) clearInterval(cycleTimer);
        cycleTimer = 0;
        if (stage) {
            stage.querySelectorAll('.danmaku-bubble').forEach(el => el.remove());
        }
    }

    if (!folded) startDanmakuLoop();

    // 折叠
    const foldBtn = board.querySelector('.board-fold') as HTMLElement;
    foldBtn?.addEventListener('click', () => {
        folded = !folded;
        board.classList.toggle('folded', folded);
        foldBtn.textContent = folded ? '▶ 展开' : '▼ 收起';
        try { localStorage.setItem(FLD_KEY, folded ? '1' : '0'); } catch {}
        if (!folded) startDanmakuLoop();
        else stopDanmakuLoop();
    });

    // 发布
    const colorInput = board.querySelector('.bf-color') as HTMLInputElement;
    board.querySelector('.bf-submit')?.addEventListener('click', () => {
        const name = (board.querySelector('.bf-name') as HTMLInputElement).value.trim() || '匿名';
        const text = (board.querySelector('.bf-text') as HTMLInputElement).value.trim();
        if (!text) return;
        const color = colorInput?.value || '';
        if (color) try { localStorage.setItem(COL_KEY, color); } catch {}
        messages.push({ name, text, time: Date.now(), color: color || undefined });
        localStorage.setItem(KEY, JSON.stringify(messages));
        (board.querySelector('.bf-text') as HTMLInputElement).value = '';
        (board.querySelector('.bf-name') as HTMLInputElement).value = '';
        board.querySelector('.board-bar-cnt')!.textContent = String(messages.length);
        stopDanmakuLoop();
        if (!folded) startDanmakuLoop();
    });

    board.querySelector('.bf-text')?.addEventListener('keydown', (e: any) => {
        if (e.key === 'Enter') (board.querySelector('.bf-submit') as HTMLElement)?.click();
    });
}

// ============================================
// 留言评论（简单客户端版）
// ============================================
function initComments() {
    const article = document.querySelector('.main-article');
    if (!article) return;
    const url = window.location.pathname;
    const KEY = 'lyan_blog_comments';

    const section = document.createElement('section');
    section.className = 'article-comments';
    section.innerHTML = `
        <h3 class="comments-title">留言 <span class="comments-count"></span></h3>
        <div class="comments-form">
            <input type="text" class="comment-name" placeholder="你的昵称" maxlength="20">
            <textarea class="comment-text" placeholder="说点什么..." rows="2"></textarea>
            <button class="comment-submit">发送</button>
        </div>
        <div class="comments-list"></div>
    `;

    const footer = article.querySelector('.article-footer');
    if (footer) footer.after(section);

    let comments: {name: string; text: string; time: number; url: string}[] = [];
    try { comments = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}

    const renderComments = () => {
        const list = section.querySelector('.comments-list')!;
        const pageComments = comments.filter(c => c.url === url);
        list.innerHTML = pageComments.length
            ? pageComments.map(c => `
                <div class="comment-item">
                    <strong>${c.name || '匿名'}</strong>
                    <p>${c.text}</p>
                    <time>${new Date(c.time).toLocaleDateString()}</time>
                </div>
            `).join('')
            : '<div class="comment-empty">暂无留言，来写第一条吧</div>';
        section.querySelector('.comments-count')!.textContent = String(pageComments.length);
    };

    renderComments();

    section.querySelector('.comment-submit')?.addEventListener('click', () => {
        const name = (section.querySelector('.comment-name') as HTMLInputElement).value.trim() || '匿名';
        const text = (section.querySelector('.comment-text') as HTMLTextAreaElement).value.trim();
        if (!text) return;
        comments.push({ name, text, time: Date.now(), url });
        localStorage.setItem(KEY, JSON.stringify(comments));
        (section.querySelector('.comment-text') as HTMLTextAreaElement).value = '';
        renderComments();
    });
}

// DOM 加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
} else {
    initAll();
}
