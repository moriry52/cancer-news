/**
 * Cancer Paper News & Journal Club Generator
 * Frontend Logic (Vanilla JS + Supabase)
 */

// Supabase Configuration
// TODO: Replace with your actual Supabase project URL and Anon Key
const SUPABASE_URL = 'https://okelbsnwfnxgkcposrwi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OqcH8552gwYL6i9QGdXumg_9tx7lTKx';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Application State
let articlesData = [];
let favoritePmids = new Set();
let currentArticleForModal = null;
let currentSlideIndex = 0;

// Pagination State
let currentPage = 1;
const itemsPerPage = 12;
let totalPages = 1;
let totalCount = 0;
let latestPublishedDate = "";
let currentCancerType = 'breast';

// Cancer type name mapping
const CANCER_NAMES = {
    'breast':      '乳癌',
    'colorectal':  '大腸癌',
    'stomach':     '胃癌',
    'hbp':         '肝胆膵癌'
};

function updateHeroTitle() {
    const heroTitle = document.getElementById('hero-title');
    const name = CANCER_NAMES[currentCancerType] || '癌';
    if (heroTitle) heroTitle.textContent = `${name} 最新論文ニュース`;
}

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
    // Client-side Routing logic
    const path = window.location.pathname.replace(/\/$/, '');
    const allowedTypes = ['breast', 'colorectal', 'stomach', 'hbp'];
    const pathPart = path.split('/').pop();
    
    if (allowedTypes.includes(pathPart)) {
        currentCancerType = pathPart;
    } else {
        currentCancerType = 'breast';
        window.history.replaceState(null, '', '/breast');
    }
    
    document.querySelectorAll('.cancer-nav-link').forEach(link => {
        if (link.dataset.id === currentCancerType) link.classList.add('active');
    });

    showGridLoading();
    loadFavoritesFromStorage();
    fetchStats();
    updateHeroTitle();
    setupEventListeners();

    // ディープリンクがある場合はそれを優先表示し、なければ通常の一覧を取得
    const isDeepLinked = await handleDeepLink();
    if (!isDeepLinked) {
        fetchArticles();
    }
});

// Deep Link Handler
async function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const pmid = params.get("pmid");
    if (pmid) {
        // Show loading while fetching the specific article
        showGridLoading();
        try {
            const { data: article, error } = await supabaseClient
                .from('articles')
                .select('*')
                .eq('pmid', pmid)
                .single();

            if (error || !article) {
                console.error("Failed to fetch deep linked article");
                showLoading(false);
                return false;
            }

            // Clean up the URL without reloading the page
            const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({ path: newUrl }, "", newUrl);

            // カードを1件だけグリッドに描画する
            renderArticleGrid([article]);

            // ページネーションを非表示にする
            const pagTop = document.getElementById("pagination-top-container");
            const pagBot = document.getElementById("pagination-container");
            if (pagTop) pagTop.innerHTML = "";
            if (pagBot) pagBot.innerHTML = "";

            // 「すべて」タブなどのアクティブ状態を外しておく（特定論文モードであることを示すため）
            document.querySelectorAll(".category-tabs .tab-btn").forEach(btn => btn.classList.remove("active"));

            return true;
        } catch (error) {
            console.error("Error fetching deep linked article:", error);
        } finally {
            showLoading(false);
        }
    }
    return false;
}

async function fetchStats() {
    try {
        const { data: latest, error: errLatest } = await supabaseClient
            .from('articles')
            .select('published_at')
            .eq('cancer_type', currentCancerType)
            .order('published_at', { ascending: false })
            .limit(1);

        if (errLatest || !latest || latest.length === 0) return;

        latestPublishedDate = latest[0].published_at.substring(0, 10);

        const startOfDay = `${latestPublishedDate}T00:00:00Z`;
        const endOfDay = `${latestPublishedDate}T23:59:59Z`;

        const { count: todayCount, error: errToday } = await supabaseClient
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .eq('cancer_type', currentCancerType)
            .gte('published_at', startOfDay)
            .lte('published_at', endOfDay);

        const { count: highScoreCount, error: errHigh } = await supabaseClient
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .eq('cancer_type', currentCancerType)
            .gte('published_at', startOfDay)
            .lte('published_at', endOfDay)
            .gte('score', 85);

        const totalEl = document.getElementById("total-articles-count");
        const highScoreEl = document.getElementById("high-score-count");
        if (totalEl) totalEl.textContent = todayCount || 0;
        if (highScoreEl) highScoreEl.textContent = highScoreCount || 0;
    } catch (e) {
        console.error("Stats fetch error:", e);
    }
}

// Load / Save Favorites from LocalStorage
function loadFavoritesFromStorage() {
    try {
        const key = `cancer_news_favorites_${currentCancerType}`;
        const stored = localStorage.getItem(key);
        if (stored) {
            favoritePmids = new Set(JSON.parse(stored));
        } else {
            favoritePmids = new Set();
        }
    } catch (e) {
        console.error("LocalStorage読み込みエラー:", e);
    }
    updateFavoriteCount();
}

function saveFavoritesToStorage() {
    try {
        const key = `cancer_news_favorites_${currentCancerType}`;
        localStorage.setItem(key, JSON.stringify(Array.from(favoritePmids)));
    } catch (e) {
        console.error("LocalStorage保存エラー:", e);
    }
    updateFavoriteCount();
}

function toggleFavorite(pmid) {
    if (favoritePmids.has(pmid)) {
        favoritePmids.delete(pmid);
    } else {
        favoritePmids.add(pmid);
    }
    saveFavoritesToStorage();
    // 再描画して星アイコンを更新 (APIから再取得は不要)
    renderArticleGrid(articlesData);
}

function updateFavoriteCount() {
    const favoriteCountEl = document.getElementById("favorite-count");
    if (favoriteCountEl) {
        favoriteCountEl.textContent = favoritePmids.size;
    }
}

function updateSystemStatus(text, isError = false) {
    const statusEl = document.getElementById("system-status");
    if (statusEl) {
        statusEl.innerHTML = isError
            ? `<span class="pulse-dot" style="background:#ef4444;"></span> ${text}`
            : `<span class="pulse-dot"></span> ${text}`;
    }
}

function showLoading(isLoading) {
    const loadingState = document.getElementById("loading-state");
    if (loadingState) {
        loadingState.style.display = isLoading ? "block" : "none";
    }
}

function showGridLoading(count = 4) {
    const newsGrid = document.getElementById("news-grid");
    if (!newsGrid) return;
    newsGrid.innerHTML = Array.from({ length: count }, () => `
        <article class="article-card skeleton-card">
            <div class="skeleton-line skeleton-badge"></div>
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line skeleton-title short"></div>
            <div class="skeleton-line skeleton-meta"></div>
            <div class="skeleton-line skeleton-body"></div>
            <div class="skeleton-line skeleton-body"></div>
            <div class="skeleton-line skeleton-body short"></div>
        </article>
    `).join("");
}

async function fetchArticles(page = 1) {
    showLoading(true);
    showGridLoading();

    const activeCategoryBtn = document.querySelector(".category-tabs .tab-btn.active");
    const category = activeCategoryBtn ? activeCategoryBtn.dataset.category : "all";
    const search = document.getElementById("search-input").value.trim();
    const sort = document.getElementById("sort-select").value;

    if (category === "favorite" && favoritePmids.size === 0) {
        articlesData = [];
        totalCount = 0;
        totalPages = 0;
        renderArticleGrid([]);
        updateSystemStatus("お気に入りはありません", false);
        showLoading(false);
        return;
    }

    try {
        let query = supabaseClient.from('articles').select('*', { count: 'exact' }).eq('cancer_type', currentCancerType);

        // Category filter
        if (category === "favorite") {
            query = query.in('pmid', Array.from(favoritePmids));
        } else if (category !== "all") {
            query = query.eq('category', category);
        }

        // Search filter
        if (search) {
            const keywords = search.split(/\\s+/).filter(k => k);
            if (keywords.length > 0) {
                for (let i = 0; i < keywords.length; i++) {
                    query = query.or(`title.ilike.%${keywords[i]}%,title_ja.ilike.%${keywords[i]}%,journal.ilike.%${keywords[i]}%,score_reason.ilike.%${keywords[i]}%`);
                }
            }
        }

        // Sorting
        if (sort === "score_desc") {
            query = query.order('score', { ascending: false }).order('published_at', { ascending: false });
        } else {
            query = query.order('published_at', { ascending: false }).order('pmid', { ascending: false });
        }

        // Pagination
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage - 1;
        query = query.range(start, end);

        const { data, count, error } = await query;

        if (error) throw error;

        articlesData = data;
        currentPage = page;
        totalCount = count;
        totalPages = Math.ceil(totalCount / itemsPerPage) || 1;

        updateSystemStatus(`取得完了 (${totalCount}件)`, false);
        renderArticleGrid(articlesData);
    } catch (error) {
        console.error("Supabase Fetch Error:", error);
        updateSystemStatus("データの取得に失敗しました", true);
        articlesData = [];
        renderArticleGrid([]);
    } finally {
        showLoading(false);
    }
}

function applyFiltersAndRender() {
    currentPage = 1;
    fetchArticles(1);
}

function navigateToPage(targetPage) {
    if (targetPage < 1 || targetPage > totalPages) return;

    // データ取得より先に画面上部へスクロールさせる
    window.scrollTo({ top: document.querySelector(".controls-bar").offsetTop - 80, behavior: "smooth" });

    fetchArticles(targetPage);
}

function renderArticleGrid(articles) {
    const newsGrid = document.getElementById("news-grid");
    // Clear all existing cards and messages
    newsGrid.innerHTML = "";

    if (articles.length === 0) {
        const activeCategoryBtn = document.querySelector(".category-tabs .tab-btn.active");
        const isFavTab = activeCategoryBtn && activeCategoryBtn.dataset.category === "favorite";

        const noResult = document.createElement("div");
        noResult.className = "loading-spinner-wrapper no-results-state";
        noResult.style.display = "block";
        noResult.innerHTML = isFavTab
            ? `<i class="fa-regular fa-star" style="font-size:2.5rem; color:#f59e0b; margin-bottom:0.75rem;"></i><p>お気に入りに登録された論文はまだありません。<br>カード右上の「★」ボタンを押してお気に入りに追加できます。</p>`
            : `<i class="fa-solid fa-folder-open" style="font-size:2.5rem; margin-bottom:0.75rem;"></i><p>条件に一致する論文は見つかりませんでした。</p>`;
        newsGrid.appendChild(noResult);
        renderPaginationControls(0);
        return;
    }

    articles.forEach((article) => {
        const card = document.createElement("article");
        card.className = "article-card";

        // 日付フォーマットヘルパー (YYYY-MM-DD)
        const formatYmd = (dateStr) => {
            if (!dateStr) return "";
            if (dateStr.length >= 10 && dateStr[4] === '-' && dateStr[7] === '-') {
                return dateStr.substring(0, 10);
            }
            return dateStr;
        };

        const publishedYmd = formatYmd(article.published_at);
        const displayPublishedYmd = article.published_at ? new Intl.DateTimeFormat('ja-JP', { 
            timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date(article.published_at)).replace(/\//g, '-') : '';

        const pubDateDisplay = article.pub_date || "";
        const authorsDisplay = (article.authors || []).slice(0, 3).join(', ');

        const isLatestDelivery = publishedYmd && latestPublishedDate && publishedYmd === latestPublishedDate;

        if (isLatestDelivery) {
            card.classList.add("card-latest-news");
        }

        const isHighScore = article.score >= 90;
        const scoreBadgeClass = isHighScore ? "score-badge high-score" : "score-badge";
        const categoryTagClass = `category-tag tag-${article.category || 'その他'}`;

        const isFav = favoritePmids.has(article.pmid);
        const favBtnClass = isFav ? "btn-bookmark active" : "btn-bookmark";
        const favIconClass = isFav ? "fa-solid fa-star" : "fa-regular fa-star";

        const summaryHtml = (article.summary_3lines || [])
            .map(line => `<li>${escapeHtml(line)}</li>`)
            .join("");

        const titleJaDisplay = article.title_ja ? escapeHtml(article.title_ja) : escapeHtml(article.title);
        const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`;

        const newBadgeHtml = isLatestDelivery
            ? `<span class="badge-new-arrival" title="最新の配信ニュースです"><i class="fa-solid fa-bolt"></i> NEW</span>`
            : "";

        card.innerHTML = `
            <div class="card-header-bar">
                <div class="header-tag-group">
                    ${newBadgeHtml}
                    <span class="${categoryTagClass}">${escapeHtml(article.category || '論文')}</span>
                    <button class="${favBtnClass}" data-pmid="${article.pmid}" title="${isFav ? 'お気に入りから削除' : 'お気に入りに追加'}">
                        <i class="${favIconClass}"></i> ${isFav ? 'お気に入り' : 'お気に入り'}
                    </button>
                </div>
                <div class="${scoreBadgeClass}">
                    <i class="fa-solid fa-fire"></i> AIおすすめ ${article.score}点
                </div>
            </div>
            
            <div class="card-body">
                <!-- 日本語タイトル (メイン表示) -->
                <h3 class="article-title-ja">${titleJaDisplay}</h3>
                <!-- 英語原本タイトル (サブ表示) -->
                <div class="article-title-en">${escapeHtml(article.title)}</div>
                
                <div class="journal-meta">
                    <span><i class="fa-regular fa-bookmark"></i> ${escapeHtml(article.journal)}</span>
                    <span class="meta-date-item" title="ニュースアプリへの配信日"><i class="fa-regular fa-clock"></i> 掲載: ${displayPublishedYmd || '今日'}</span>
                    <span class="meta-date-item" title="PubMed論文の出版日"><i class="fa-regular fa-calendar-days"></i> Publish: ${escapeHtml(pubDateDisplay)}</span>
                </div>
                ${authorsDisplay ? `<div class="article-authors"><i class="fa-regular fa-user"></i> ${escapeHtml(authorsDisplay)}</div>` : ''}
                
                <div class="summary-container">
                    <div class="summary-header">
                        <i class="fa-solid fa-list-check"></i> 日本語3行要約
                    </div>
                    <ul class="summary-list">
                        ${summaryHtml}
                    </ul>
                </div>

                <div class="score-reason-box">
                    <strong>選定理由:</strong> ${escapeHtml(article.score_reason || '')}
                </div>
            </div>

            <div class="card-footer">
                <div class="card-action-group">
                    <button class="btn-open-slides" data-pmid="${article.pmid}">
                        <i class="fa-solid fa-file-powerpoint"></i> スライドを見る
                    </button>
                    <a href="${pubmedUrl}" target="_blank" rel="noopener noreferrer" class="btn-pubmed-external" title="PubMedで原著論文を閲覧">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> PubMed
                    </a>
                    <button class="btn-share" data-pmid="${article.pmid}" title="この論文を共有する">
                        <i class="fa-solid fa-share-nodes"></i> 共有
                    </button>
                </div>
            </div>
        `;

        // Event listener for favorite toggle
        card.querySelector(".btn-bookmark").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(article.pmid);
        });

        // Event listener for share button
        card.querySelector(".btn-share").addEventListener("click", (e) => {
            e.stopPropagation();
            shareArticle(article.pmid, titleJaDisplay);
        });

        // Event listener for slide modal open
        card.querySelector(".btn-open-slides").addEventListener("click", () => {
            openSlideModal(article);
        });

        newsGrid.appendChild(card);
    });

    renderPaginationControls();
}

// Render Pagination Controls
function renderPaginationControls(localItemCount) {
    const containers = [
        document.getElementById("pagination-top-container"),
        document.getElementById("pagination-container")
    ].filter(Boolean);
    if (containers.length === 0) return;

    const pageHtml = buildPaginationHtml();
    containers.forEach((container) => {
        container.innerHTML = pageHtml;
    });

    if (totalCount === 0) return;
    attachPaginationEvents();
}

function buildPaginationHtml() {
    if (totalCount === 0) return "";

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalCount);

    let html = `
        <div class="pagination-info">
            全 <strong>${totalCount}</strong> 件中 <strong>${startItem}〜${endItem}</strong> 件目を表示中 (ページ ${currentPage}/${totalPages})
        </div>
    `;

    if (totalPages > 1) {
        html += `
            <div class="pagination-buttons">
                <button class="page-btn nav-page-btn" id="btn-prev-page" ${currentPage === 1 ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-left"></i> 前へ
                </button>
        `;

        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, currentPage + 2);

        if (startPage > 1) {
            html += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) html += `<span>...</span>`;
        }

        for (let p = startPage; p <= endPage; p++) {
            const isActive = p === currentPage;
            const cls = isActive ? "page-btn active" : "page-btn";
            const dis = isActive ? "disabled" : "";
            html += `<button class="${cls}" data-page="${p}" ${dis}>${p}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span>...</span>`;
            html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        html += `
                <button class="page-btn nav-page-btn" id="btn-next-page" ${currentPage === totalPages ? 'disabled' : ''}>
                    次へ <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;
    }

    return html;
}

function attachPaginationEvents() {
    const containers = [
        document.getElementById("pagination-top-container"),
        document.getElementById("pagination-container")
    ].filter(Boolean);
    const allButtons = [];

    containers.forEach((container) => {
        container.querySelectorAll(".page-btn[data-page]").forEach(btn => allButtons.push(btn));
    });

    allButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            navigateToPage(parseInt(btn.dataset.page, 10));
        });
    });

    const prevBtns = containers.flatMap(container => Array.from(container.querySelectorAll("#btn-prev-page")));
    prevBtns.forEach(prevBtn => {
        prevBtn.addEventListener("click", () => {
            if (currentPage > 1) navigateToPage(currentPage - 1);
        });
    });

    const nextBtns = containers.flatMap(container => Array.from(container.querySelectorAll("#btn-next-page")));
    nextBtns.forEach(nextBtn => {
        nextBtn.addEventListener("click", () => {
            navigateToPage(currentPage + 1);
        });
    });
}


// Slide Modal Logic
function openSlideModal(article) {
    currentArticleForModal = article;
    currentSlideIndex = 0;

    const modal = document.getElementById("slide-modal");
    renderSlideView();

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeSlideModal() {
    const modal = document.getElementById("slide-modal");
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = ""; // <body>スクロール復元
}

// 共有機能
async function shareArticle(pmid, title) {
    const shareUrl = `${window.location.origin}/?pmid=${pmid}`;
    const cancerName = CANCER_NAMES[currentCancerType] || '癌';
    const shareData = {
        title: `${cancerName}論文ニュース`,
        text: `【注目論文】${title}`,
        url: shareUrl,
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            console.log("共有がキャンセルされたか、エラーが発生しました:", err);
        }
    } else {
        // フォールバック: クリップボードにコピー
        try {
            await navigator.clipboard.writeText(`${shareData.text}\n${shareUrl}`);
            alert("クリップボードにリンクをコピーしました。");
        } catch (err) {
            alert("URLをコピーできませんでした:\n" + shareUrl);
        }
    }
}
function renderSlideView() {
    const article = currentArticleForModal;
    if (!article) return;

    const contentSlides = article.slides || [];
    // スライド0 = 表紙, スライド1〜N = コンテンツスライド
    const totalSlides = contentSlides.length + 1;

    const formatYmd = (dateStr) => {
        if (!dateStr) return "";
        if (dateStr.length >= 10 && dateStr[4] === '-' && dateStr[7] === '-') {
            return dateStr.substring(0, 10);
        }
        return dateStr;
    };

    const slideBoxInner = document.getElementById("slide-box-inner");
    slideBoxInner.innerHTML = "";

    if (currentSlideIndex === 0) {
        // --- 表紙スライド ---
        const titleJa = escapeHtml(article.title_ja || article.title);
        const titleEn = escapeHtml(article.title);
        const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`;
        const publishedYmd = formatYmd(article.published_at);
        const displayPublishedYmd = article.published_at ? new Intl.DateTimeFormat('ja-JP', { 
            timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date(article.published_at)).replace(/\//g, '-') : '';
        const authorsDisplay = (article.authors || []).slice(0, 5).join(', ');
        const categoryClass = `category-tag tag-${article.category || 'その他'}`;

        slideBoxInner.innerHTML = `
            <div class="slide-cover">
                <div class="slide-cover-header">
                    <span class="${categoryClass}">${escapeHtml(article.category || '論文')}</span>
                    <span class="slide-cover-score"><i class="fa-solid fa-fire"></i> AIスコア ${article.score}点</span>
                </div>
                <h2 class="slide-cover-title-ja">${titleJa}</h2>
                <div class="slide-cover-title-en">${titleEn}</div>
                <div class="slide-cover-meta">
                    <span><i class="fa-regular fa-bookmark"></i> ${escapeHtml(article.journal || '')}</span>
                    <span><i class="fa-regular fa-clock"></i> 掲載: ${displayPublishedYmd || '今日'}</span>
                    <span><i class="fa-regular fa-calendar-days"></i> 論文出版: ${escapeHtml(article.pub_date || '')}</span>
                </div>
                ${authorsDisplay ? `<div class="slide-cover-authors"><i class="fa-regular fa-user"></i> ${escapeHtml(authorsDisplay)}</div>` : ''}
            </div>
        `;
    } else {
        // --- コンテンツスライド (1-indexed, contentSlides[currentSlideIndex - 1]) ---
        const slide = contentSlides[currentSlideIndex - 1];
        if (!slide) return;

        const slideTypeIcon = {
            "Background": "fa-book-open",
            "Methods": "fa-flask",
            "Results": "fa-chart-bar",
            "Conclusion": "fa-flag-checkered",
            "Clinical Takeaway": "fa-stethoscope"
        }[slide.slide_type] || "fa-file";

        const bulletsHtml = (slide.bullets || [])
            .map(b => `<li>${escapeHtml(b)}</li>`)
            .join("");

        slideBoxInner.innerHTML = `
            <div class="slide-content">
                <div class="slide-content-header">
                    <span class="slide-type-badge"><i class="fa-solid ${slideTypeIcon}"></i> ${escapeHtml(slide.slide_type || '')}</span>
                </div>
                <h3 class="slide-content-title">${escapeHtml(slide.title || '')}</h3>
                <ul class="slide-bullets">${bulletsHtml}</ul>
            </div>
        `;
    }

    // カウンター更新
    const counterEl = document.getElementById("slide-counter");
    if (counterEl) counterEl.textContent = `${currentSlideIndex + 1} / ${totalSlides}`;

    // ナビゲーションボタン制御
    const prevBtn = document.getElementById("btn-prev-slide");
    const nextBtn = document.getElementById("btn-next-slide");
    if (prevBtn) prevBtn.disabled = currentSlideIndex === 0;
    if (nextBtn) nextBtn.disabled = currentSlideIndex === totalSlides - 1;

    // ドット更新 (トップバーの slide-dots)
    const dotsContainer = document.getElementById("slide-dots");
    if (dotsContainer) {
        dotsContainer.innerHTML = "";
        for (let i = 0; i < totalSlides; i++) {
            const dot = document.createElement("span");
            dot.className = i === currentSlideIndex ? "dot active" : "dot";
            dot.addEventListener("click", () => {
                currentSlideIndex = i;
                renderSlideView();
            });
            dotsContainer.appendChild(dot);
        }
    }
}


// Copy Slide Content to Clipboard
function copyCurrentSlideToClipboard() {
    if (!currentArticleForModal || !currentArticleForModal.slides) return;
    const slide = currentArticleForModal.slides[currentSlideIndex];

    const textToCopy = `【${slide.title}】\n` + (slide.bullets || []).map(b => `・${b}`).join("\n");

    navigator.clipboard.writeText(textToCopy).then(() => {
        //const copyBtn = document.getElementById("btn-copy-slide");
        const originalHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = `<i class="fa-solid fa-check" style="color:#059669;"></i> コピー完了!`;
        setTimeout(() => {
            copyBtn.innerHTML = originalHtml;
        }, 1800);
    }).catch(err => {
        console.error("クリップボードコピー失敗:", err);
    });
}

// Setup DOM Event Listeners
function setupEventListeners() {
    // Refresh Button
    /*const refreshBtn = document.getElementById("btn-refresh");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            if (db) {
                fetchArticlesFromFirestore();
            } else {
                loadMockArticles();
            }
        });
    }*/

    // Category Tabs
    const categoryTabs = document.getElementById("category-tabs");
    if (categoryTabs) {
        categoryTabs.addEventListener("click", async (e) => {
            const btn = e.target.closest(".tab-btn");
            if (btn) {
                categoryTabs.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                applyFiltersAndRender();
            }
        });
    }

    // Cancer Type Navigation
    document.querySelectorAll('.cancer-nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetType = link.dataset.id;
            if (targetType === currentCancerType) return;
            
            currentCancerType = targetType;
            window.history.pushState(null, '', `/${targetType}`);
            
            document.querySelectorAll('.cancer-nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Update hero title for new cancer type
            updateHeroTitle();
            
            // Reset favorites for new cancer type
            loadFavoritesFromStorage();
            
            // Reset to 'all' tab and fetch
            const allTab = document.querySelector('.category-tabs .tab-btn[data-category="all"]');
            if (allTab) {
                document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
                allTab.classList.add('active');
            }
            fetchStats();
            applyFiltersAndRender();
        });
    });

    // Search Input: 300ms デバウンスでハイブリッド検索を実行
    let searchDebounceTimer = null;
    document.getElementById("search-input").addEventListener("input", () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => applyFiltersAndRender(), 300);
    });
    document.getElementById("sort-select").addEventListener("change", applyFiltersAndRender);

    // Modal Close
    document.getElementById("modal-close").addEventListener("click", closeSlideModal);
    document.getElementById("slide-modal").addEventListener("click", (e) => {
        if (e.target.id === "slide-modal") {
            closeSlideModal();
        }
    });

    // Slide Controls
    document.getElementById("btn-prev-slide").addEventListener("click", () => {
        if (currentSlideIndex > 0) {
            currentSlideIndex--;
            renderSlideView();
        }
    });

    document.getElementById("btn-next-slide").addEventListener("click", () => {
        if (!currentArticleForModal) return;
        const totalSlides = (currentArticleForModal.slides || []).length + 1; // 表紙+コンテンツ
        if (currentSlideIndex < totalSlides - 1) {
            currentSlideIndex++;
            renderSlideView();
        }
    });

    //document.getElementById("btn-copy-slide").addEventListener("click", copyCurrentSlideToClipboard);

    // Keyboard Arrow Keys for Slide Navigation
    document.addEventListener("keydown", (e) => {
        const modal = document.getElementById("slide-modal");
        if (modal.classList.contains("active")) {
            const totalSlides = currentArticleForModal ? (currentArticleForModal.slides || []).length + 1 : 1;
            if (e.key === "ArrowLeft" && currentSlideIndex > 0) {
                currentSlideIndex--;
                renderSlideView();
            } else if (e.key === "ArrowRight" && currentSlideIndex < totalSlides - 1) {
                currentSlideIndex++;
                renderSlideView();
            } else if (e.key === "Escape") {
                closeSlideModal();
            }
        }
    });
}

// Utility: Escape HTML
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
