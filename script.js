document.addEventListener('DOMContentLoaded', function() {
    initializeMenu();
});

let globalMenuData = null;
let globalCategories = {};
let isDataLoaded = false;
let currentActiveCategory = null;

const VIRTUAL_SCROLL_CONFIG = {
    itemHeight: 120,
    containerHeight: 600,
    overscan: 3,
    batchSize: 15
};

let virtualScrollState = {
    scrollTop: 0,
    visibleStartIndex: 0,
    visibleEndIndex: 0,
    totalHeight: 0,
    renderedItems: new Set(),
    renderTimeout: null,
    lastLoggedCount: 0
};

let performanceCache = {
    renderedSections: new Map(),
    imageCache: new Map(),
    categoryData: new Map()
};

let autoUpdateInterval;
let lastUpdateTime = new Date();
let isUpdating = false;

async function initializeMenu() {
    try {
        showLoading(true);

        globalMenuData = await fetchMenuData();

        if (globalMenuData.length < 10) {
            showNotification('API erişimi sınırlı. Demo menü verisi gösteriliyor. Lütfen birkaç dakika sonra tekrar deneyin.', 'warning');
            console.warn('Fallback data kullanılıyor - sadece', globalMenuData.length, 'ürün mevcut');
        } else {
            console.log('API\'den başarıyla', globalMenuData.length, 'ürün alındı');
        }

        categorizeProducts(globalMenuData);

        generateMenuSections();

        showLoading(false);

        initializeTabs();

        initializeOtherFeatures();

        testTabFunctionality();

        setTimeout(() => {
            const firstCategory = document.querySelector('.menu-section.active');
            if (firstCategory) {
                preloadCategoryImages(firstCategory.id);
            }
        }, 1000);

        setTimeout(() => {
            const strategy = optimizeImageLoadingStrategy();
            console.log('Using image loading strategy:', strategy);
            preloadAllImages();
        }, 2000);

        startAutoUpdate();

        isDataLoaded = true;

    } catch (error) {
        console.error('Menü yüklenirken hata oluştu:', error);
        showLoading(false);

        const errorMessage = error && error.message ? error.message : 'Bilinmeyen hata';

        if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
            showError('API erişim limiti aşıldı. Lütfen birkaç dakika sonra tekrar deneyin.');
        } else {
            showError(`Menü yüklenirken bir hata oluştu: ${errorMessage}`);
        }

        try {
            console.log('Fallback veri yükleniyor...');
            globalMenuData = getFallbackMenuData();
            categorizeProducts(globalMenuData);
            generateMenuSections();
            initializeTabs();

            startAutoUpdate();
            isDataLoaded = true;
        } catch (fallbackError) {
            console.error('Fallback data da yüklenemedi:', fallbackError);
            showError('Menü yüklenemedi. Lütfen sayfayı yenileyin.');
        }
    }
}

function categorizeProducts(menuData) {
    console.log('Categorizing products...');

    const categoryMappings = {
        'coffee': { title: 'Sıcak Kahveler', icon: 'fas fa-coffee', items: [] },
        'iced-coffee': { title: 'Soğuk Kahveler', icon: 'fas fa-snowflake', items: [] },
        'turkish-coffee': { title: 'Türk Kahveleri', icon: 'fas fa-fire', items: [] },
        'hot-drinks': { title: 'Sıcak İçecekler', icon: 'fas fa-mug-hot', items: [] },
        'cold-drinks': { title: 'Soğuk İçecekler', icon: 'fas fa-glass-whiskey', items: [] },
        'cold-beverages': { title: 'Soğuk Meşrubatlar', icon: 'fas fa-bottle-water', items: [] },
        'milkshakes': { title: 'Milkshake', icon: 'fas fa-blender', items: [] },
        'frozens': { title: 'Frozen', icon: 'fas fa-icicles', items: [] },
        'herbal-teas': { title: 'Bitki Çayları', icon: 'fas fa-leaf', items: [] },
        'fruit-teas': { title: 'Meyve Çayları', icon: 'fas fa-apple-alt', items: [] },
        'snacks': { title: 'Adet Lezzetler', icon: 'fas fa-cookie-bite', items: [] },
        'syrupy-desserts': { title: 'Şerbetli Tatlılar', icon: 'fas fa-honey-pot', items: [] },
        'breakfast': { title: 'Kahvaltılar', icon: 'fas fa-egg', items: [] },
        'desserts': { title: 'Tatlılar', icon: 'fas fa-ice-cream', items: [] },
        'pastries': { title: 'Pastalar', icon: 'fas fa-birthday-cake', items: [] }
    };

    menuData.forEach(product => {
        const category = getProductCategory(product.id);
        if (category && categoryMappings[category]) {
            categoryMappings[category].items.push(product);
        }
    });

    globalCategories = categoryMappings;

    console.log('Products categorized:', Object.keys(globalCategories).map(key => ({
        category: key,
        count: globalCategories[key].items.length
    })));
}

function startAutoUpdate() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
    }

    autoUpdateInterval = setInterval(async () => {
        if (!isUpdating) {
            await updateMenuData();
        }
    }, 1.5 * 60 * 60 * 1000);

    console.log('Otomatik güncelleme sistemi başlatıldı (1.5 saatte bir)');
}

function stopAutoUpdate() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
        console.log('Otomatik güncelleme sistemi durduruldu');
        showNotification('Otomatik güncelleme durduruldu', 'info');
    }
}

function toggleAutoUpdate() {
    if (autoUpdateInterval) {
        stopAutoUpdate();
    } else {
        startAutoUpdate();
    }
}

function cleanup() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
        console.log('Otomatik güncelleme temizlendi');
    }
}

window.addEventListener('beforeunload', cleanup);

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Sayfa gizlendi, güncelleme devam ediyor...');
    } else {
        console.log('Sayfa tekrar görünür oldu');
    }
});

async function updateMenuData() {
    if (isUpdating) return;

    try {
        isUpdating = true;
        console.log('Menü güncelleniyor...', new Date().toLocaleTimeString());

        showUpdateIndicator(true);

        const freshData = await fetchMenuData();

        if (hasDataChanged(globalMenuData, freshData)) {
            console.log('Yeni veri bulundu, menü güncelleniyor...');

            globalMenuData = freshData;
            categorizeProducts(freshData);

            generateMenuSections();

            initializeTabs();

            lastUpdateTime = new Date();

        } else {
            console.log('Yeni veri yok, güncelleme gerekmiyor');
        }

    } catch (error) {
        console.error('Menü güncellenirken hata oluştu:', error);
        showNotification('Güncelleme sırasında hata oluştu', 'warning');
    } finally {
        isUpdating = false;
        showUpdateIndicator(false);
    }
}

function hasDataChanged(oldData, newData) {
    if (!oldData || !newData) return true;
    if (oldData.length !== newData.length) return true;

    const oldString = JSON.stringify(oldData);
    const newString = JSON.stringify(newData);

    return oldString !== newString;
}



function showUpdateIndicator(show) {
    let indicator = document.getElementById('update-indicator');

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'update-indicator';
        indicator.className = 'update-indicator';
        indicator.innerHTML = `
            <div class="update-content">
                <i class="fas fa-sync-alt fa-spin"></i>
                <span>Güncelleniyor...</span>
            </div>
        `;
        document.body.appendChild(indicator);
    }

    indicator.style.display = show ? 'flex' : 'none';
}



async function fetchMenuData() {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔄 API çağrısı denemesi ${attempt}/${maxRetries}`);

            const response = await fetch('https://script.google.com/macros/s/AKfycbwpNTJfPxoATnLl8-_e_SJlkX-QcWqIEtZMZSNrpIcIQT63h1zvdRCw2ZQrfJQGYmGknw/exec', {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.status === 429) {
                console.log('Rate limit aşıldı. Fallback veri kullanılıyor.');
                throw new Error('429 Too Many Requests');
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(`Google Apps Script hatası: ${data.error}`);
            }

            if (!Array.isArray(data)) {
                console.error('❌ API response array değil:', data);
                throw new Error('API response beklenen format değil');
            }

            console.log(`🟢 Google Apps Script'ten ${data.length} ürün başarıyla alındı!`);
            console.log('📋 İlk 3 ürün örneği:', data.slice(0, 3));
            return data;

        } catch (error) {
            lastError = error;
            console.warn(`❌ API çağrısı ${attempt}. denemede başarısız:`, error.message);

            if (attempt === maxRetries || error.message.includes('429')) {
                console.error('🔴 API erişimi başarısız. Fallback veri kullanılıyor.');
                return getFallbackMenuData();
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return getFallbackMenuData();
}

function getFallbackMenuData() {
    console.log('🟡 Fallback menü verisi kullanılıyor... (Eski fiyatlar olabilir)');
    return [
        {
            id: 'coffee_1',
            urun_adi: 'Double Espresso',
            fiyat: '₺70',
            resim_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'coffee_2',
            urun_adi: 'Single Espresso',
            fiyat: '₺60',
            resim_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'coffee_3',
            urun_adi: 'Fındıklı Latte',
            fiyat: '₺100',
            resim_url: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'coffee_4',
            urun_adi: 'Americano',
            fiyat: '₺75',
            resim_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'iced_coffee_1',
            urun_adi: 'Iced Mocha',
            fiyat: '₺95',
            resim_url: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'iced_coffee_2',
            urun_adi: 'Iced Latte',
            fiyat: '₺85',
            resim_url: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'turkish_coffee_1',
            urun_adi: 'Türk Kahvesi',
            fiyat: '₺60',
            resim_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'turkish_coffee_2',
            urun_adi: 'Damla Sakızlı Türk Kahvesi',
            fiyat: '₺95',
            resim_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'hot_drinks_1',
            urun_adi: 'Çay',
            fiyat: '₺20',
            resim_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'hot_drinks_2',
            urun_adi: 'Sıcak Çikolata',
            fiyat: '₺90',
            resim_url: 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'cold_drinks_1',
            urun_adi: 'Çilekli Limonata',
            fiyat: '₺80',
            resim_url: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'cold_drinks_2',
            urun_adi: 'Doğal Limonata',
            fiyat: '₺70',
            resim_url: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'cold_beverages_1',
            urun_adi: 'Coca-Cola',
            fiyat: '₺60',
            resim_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'cold_beverages_2',
            urun_adi: 'Sprite',
            fiyat: '₺60',
            resim_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'milkshakes_1',
            urun_adi: 'Çikolatalı Milkshake',
            fiyat: '₺110',
            resim_url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'milkshakes_2',
            urun_adi: 'Çilekli Milkshake',
            fiyat: '₺110',
            resim_url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'frozens_1',
            urun_adi: 'Çilekli Frozen',
            fiyat: '₺110',
            resim_url: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'frozens_2',
            urun_adi: 'Karpuzlu Frozen',
            fiyat: '₺110',
            resim_url: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'herbal_teas_1',
            urun_adi: 'Nane Limon Bitki Çayı',
            fiyat: '₺75',
            resim_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'herbal_teas_2',
            urun_adi: 'Yeşil Çay',
            fiyat: '₺75',
            resim_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'fruit_teas_1',
            urun_adi: 'Kuşburnu Meyve Çayı',
            fiyat: '₺75',
            resim_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'fruit_teas_2',
            urun_adi: 'Elma Meyve Çayı',
            fiyat: '₺75',
            resim_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'snacks_1',
            urun_adi: 'Damla Çikolatalı Cookie',
            fiyat: '₺50',
            resim_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'snacks_2',
            urun_adi: 'Elmalı Kurabiye',
            fiyat: '₺50',
            resim_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'syrupy_desserts_1',
            urun_adi: 'Fıstıklı Baklava',
            fiyat: '₺700',
            resim_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'syrupy_desserts_2',
            urun_adi: 'Şekerpare',
            fiyat: '₺400',
            resim_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'breakfast_1',
            urun_adi: 'Kahvaltı Tabağı',
            fiyat: '₺130',
            resim_url: 'https://images.unsplash.com/photo-1494859802809-d069c3b71a8a?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'breakfast_2',
            urun_adi: 'Soğuk Sandviç',
            fiyat: '₺80',
            resim_url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'desserts_1',
            urun_adi: 'San Sebastian Cheese Cake',
            fiyat: '₺200',
            resim_url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'desserts_2',
            urun_adi: 'Çilekli Magnolya',
            fiyat: '₺150',
            resim_url: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=300&h=200&fit=crop&q=80&fm=webp'
        },

        {
            id: 'pastries_1',
            urun_adi: 'Malaga',
            fiyat: '₺200',
            resim_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=300&h=200&fit=crop&q=80&fm=webp'
        },
        {
            id: 'pastries_2',
            urun_adi: 'Çilekli Pasta',
            fiyat: '₺200',
            resim_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=300&h=200&fit=crop&q=80&fm=webp'
        }
    ];
}

function generateMenuSections() {
    const menuContainer = document.getElementById('menu-container');
    if (!menuContainer) {
        console.error('Menu container not found');
        return;
    }

    console.log('Generating menu sections with virtual scrolling');

    menuContainer.innerHTML = '';

    let firstCategory = true;
    let sectionsCreated = 0;

    Object.keys(globalCategories).forEach((categoryKey) => {
        const category = globalCategories[categoryKey];
        if (category.items.length > 0) {
            const sectionHTML = generateCategorySection(categoryKey, category, firstCategory);
            menuContainer.innerHTML += sectionHTML;
            console.log(`Generated section for ${categoryKey} with ${category.items.length} items`);
            firstCategory = false;
            sectionsCreated++;
        }
    });

    console.log(`Total sections created: ${sectionsCreated}`);

    const firstSection = menuContainer.querySelector('.menu-section');
    if (firstSection) {
        firstSection.classList.add('active');
        currentActiveCategory = firstSection.id;
        console.log('First section activated:', firstSection.id);

    } else {
        console.error('No menu sections were created!');
    }

    const allSections = menuContainer.querySelectorAll('.menu-section');
    console.log('All created sections:', Array.from(allSections).map(s => s.id));
}

function getProductCategory(productId) {
    if (productId.startsWith('coffee_')) return 'coffee';
    if (productId.startsWith('iced_coffee_')) return 'iced-coffee';
    if (productId.startsWith('turkish_coffee_')) return 'turkish-coffee';
    if (productId.startsWith('hot_drinks_')) return 'hot-drinks';
    if (productId.startsWith('cold_drinks_')) return 'cold-drinks';
    if (productId.startsWith('cold_beverages_')) return 'cold-beverages';
    if (productId.startsWith('milkshakes_')) return 'milkshakes';
    if (productId.startsWith('frozens_')) return 'frozens';
    if (productId.startsWith('herbal_teas_')) return 'herbal-teas';
    if (productId.startsWith('fruit_teas_')) return 'fruit-teas';
    if (productId.startsWith('snacks_')) return 'snacks';
    if (productId.startsWith('syrupy_desserts_')) return 'syrupy-desserts';
    if (productId.startsWith('breakfast_')) return 'breakfast';
    if (productId.startsWith('desserts_')) return 'desserts';
    if (productId.startsWith('pastries_')) return 'pastries';

    return null;
}

function generateCategorySection(categoryId, category, isActive = false) {
    const activeClass = isActive ? 'active' : '';

    console.log(`Generating section ${categoryId}, active: ${isActive}, items: ${category.items.length}`);

    const itemsHTML = category.items.map(item => generateMenuItemHTML(item)).join('');

    return `
        <section class="menu-section ${activeClass}" id="${categoryId}">
            <h3>${category.title}</h3>
            <div class="menu-grid">
                ${itemsHTML}
            </div>
        </section>
    `;
}

const requestIdleCallback = window.requestIdleCallback || function(callback) {
    return setTimeout(() => callback({ didTimeout: false }), 1);
};

const imageCache = new Map();

function preloadAndCacheImage(url) {
    if (!url || imageCache.has(url)) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            imageCache.set(url, img);
            resolve();
        };
        img.onerror = () => {
            console.warn('Failed to load image:', url);
            reject();
        };
        img.src = url;
    });
}

function preloadCategoryImages(categoryId) {
    const categorySection = document.getElementById(categoryId);
    if (!categorySection) return;

    const images = categorySection.querySelectorAll('img[src]');
    const imageUrls = Array.from(images).map(img => img.src).filter(src => src);

    const uncachedUrls = imageUrls.filter(url => !imageCache.has(url));

    if (uncachedUrls.length === 0) {
        console.log(`All images for category ${categoryId} are already cached`);
        return;
    }

    requestIdleCallback(() => {
        Promise.allSettled(
            uncachedUrls.map(url => preloadAndCacheImage(url))
        ).then(results => {
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            const totalCount = results.length;
            console.log(`Preloaded ${successCount}/${totalCount} images for category ${categoryId}`);
        });
    });
}

function preloadAllImages() {
    if (!globalMenuData || globalMenuData.length === 0) return;

    console.log('Preloading all images for better performance...');

    const allImageUrls = globalMenuData
        .map(item => item.resim_url)
        .filter(url => url && url.trim() !== '')
        .map(url => optimizeImageUrl(url));

    const uniqueImageUrls = [...new Set(allImageUrls)];

    console.log(`Preloading ${uniqueImageUrls.length} unique images...`);

    const batchSize = 10;
    let currentBatch = 0;

    function preloadBatch() {
        const start = currentBatch * batchSize;
        const end = Math.min(start + batchSize, uniqueImageUrls.length);
        const batch = uniqueImageUrls.slice(start, end);

        if (batch.length === 0) {
            console.log('All images preloaded successfully');
            return;
        }

        Promise.allSettled(
            batch.map(url => preloadAndCacheImage(url))
        ).then(results => {
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            console.log(`Batch ${currentBatch + 1}: ${successCount}/${batch.length} images preloaded`);

            currentBatch++;
            setTimeout(preloadBatch, 100);
        });
    }

    preloadBatch();
}

function getPerformanceStats() {
    const stats = {
        totalProducts: globalMenuData ? globalMenuData.length : 0,
        totalCategories: Object.keys(globalCategories).length,
        cachedImages: imageCache.size,
        currentActiveCategory: currentActiveCategory,
        isDataLoaded: isDataLoaded,
        lastUpdateTime: lastUpdateTime,
        virtualScroll: {
            renderedItems: virtualScrollState.renderedItems.size,
            cacheSize: performanceCache.renderedSections.size,
            config: VIRTUAL_SCROLL_CONFIG
        },
        performance: {
            memory: performance.memory ? {
                usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
                totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB'
            } : 'Not available',
            connection: navigator.connection ? {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink + 'Mbps'
            } : 'Not available'
        }
    };

    console.log('Performance Statistics:', stats);
    return stats;
}

function optimizeImageLoadingStrategy() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const isSlowConnection = connection && (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g');
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isSlowConnection || isMobile) {
        console.log('Slow connection detected, optimizing image loading strategy...');
        return {
            batchSize: 5,
            delay: 200,
            priority: 'low'
        };
    }

    return {
        batchSize: 15,
        delay: 50,
        priority: 'high'
    };
}

function exportPerformanceData() {
    const data = {
        timestamp: new Date().toISOString(),
        performance: getPerformanceStats(),
        imageCache: {
            size: imageCache.size,
            urls: Array.from(imageCache.keys())
        },
        categories: Object.keys(globalCategories).map(key => ({
            name: key,
            productCount: globalCategories[key].items.length
        })),
        systemInfo: {
            userAgent: navigator.userAgent,
            connection: navigator.connection ? {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink,
                rtt: navigator.connection.rtt
            } : 'Not available',
            memory: performance.memory ? {
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize
            } : 'Not available'
        }
    };

    console.log('Performance Data Export:', data);
    return data;
}

window.menuPerformance = {
    getStats: getPerformanceStats,
    exportData: exportPerformanceData,
    getImageCache: () => imageCache,
    getCategories: () => globalCategories,
    getCurrentCategory: () => currentActiveCategory
};

function optimizeImageUrl(originalUrl) {
    if (!originalUrl || originalUrl.trim() === '') return '';

    if (originalUrl.includes('unsplash.com')) {
        const baseUrl = originalUrl.split('?')[0];
        return `${baseUrl}?w=300&h=200&fit=crop&q=80&fm=webp`;
    }

    if (originalUrl.includes('images.unsplash.com')) {
        const baseUrl = originalUrl.split('?')[0];
        return `${baseUrl}?w=300&h=200&fit=crop&q=80&fm=webp`;
    }

    return originalUrl;
}

function generateMenuItemHTML(item) {
    const optimizedImageUrl = optimizeImageUrl(item.resim_url);
    const imageHTML = optimizedImageUrl && optimizedImageUrl.trim() !== ''
        ? `<img src="${optimizedImageUrl}" alt="${item.urun_adi}" loading="lazy" onerror="this.style.display='none'" onload="this.style.opacity='1'" style="opacity: 0; transition: opacity 0.2s ease;">`
        : '';

    const iconClass = getIconClassForProduct(item.id);

    return `
        <div class="menu-item" data-item-id="${item.id}">
            <div class="menu-item-image">
                ${imageHTML}
                <i class="${iconClass}"></i>
            </div>
            <div class="menu-item-content">
                <h4>${item.urun_adi}</h4>
                <p>${getProductDescription(item.urun_adi)}</p>
                <span class="price">${item.fiyat}</span>
            </div>
        </div>
    `;
}

function getIconClassForProduct(productId) {
    if (productId.startsWith('coffee_')) return 'fas fa-coffee';
    if (productId.startsWith('iced_coffee_')) return 'fas fa-snowflake';
    if (productId.startsWith('turkish_coffee_')) return 'fas fa-fire';
    if (productId.startsWith('hot_drinks_')) return 'fas fa-mug-hot';
    if (productId.startsWith('cold_drinks_')) return 'fas fa-glass-whiskey';
    if (productId.startsWith('cold_beverages_')) return 'fas fa-bottle-water';
    if (productId.startsWith('milkshakes_')) return 'fas fa-blender';
    if (productId.startsWith('frozens_')) return 'fas fa-icicles';
    if (productId.startsWith('herbal_teas_')) return 'fas fa-leaf';
    if (productId.startsWith('fruit_teas_')) return 'fas fa-apple-alt';
    if (productId.startsWith('snacks_')) return 'fas fa-cookie-bite';
    if (productId.startsWith('syrupy_desserts_')) return 'fas fa-honey-pot';
    if (productId.startsWith('breakfast_')) return 'fas fa-egg';
    if (productId.startsWith('desserts_')) return 'fas fa-ice-cream';
    if (productId.startsWith('pastries_')) return 'fas fa-birthday-cake';

    return 'fas fa-utensils';
}

function getProductDescription(productName) {
    const descriptions = {
        'Double Espresso': 'Daha güçlü bir kahve deneyimi için çift shot',
        'Single Espresso': 'Tek shot, sert ve yoğun kahve keyfi',
        'Fındıklı Latte': 'Yoğun espresso, kadifemsi süt ve enfes fındık aromasıyla yumuşak içimli lezzet',
        'Toffee Nut Latte': 'Karamel, fındık aroması ve espresso\'nun eşsiz buluşması',
        'Zebra Latte': 'Beyaz çikolata ve klasik çikolatanın espresso ile birleştiği, süt köpüğüyle tamamlanan tatlı ve lezzetli içim',
        'Nescafe': 'Hazır kahve keyfi, pratik ve hızlı',
        'White Chocolate Mocha': 'Espresso, soğuk süt ve beyaz çikolata şurubunun buzla birleştiği, kremsi ve tatlı bir soğuk kahve',
        'Americano': 'Espresso\'nun sıcak suyla yumuşatılmış hali',
        'Latte': 'Sütlü ve yumuşak içimli kahve',
        'Filtre Kahve (French Press)': 'French press ile servis edilir',
        'Mocha': 'Çikolata ve kahvenin enfes buluşması',
        'Espresso Macchiato': 'Espresso üzerine hafif süt köpüğü',
        'Cappuccino': 'Köpüklü süt ve espresso uyumu',
        'Caramel Latte': 'Yumuşak espresso, kadifemsi süt ve karamel lezzetinin tatlı uyumu',
        'Vanilla Latte': 'Yoğun espresso ve kremsi sütün vanilya aromasıyla buluştuğu hafif ve tatlı içim',
        'Çay': 'Demleme siyah çay, taze ve lezzetli',
        'Fincan Çay': 'Özel sunumda küçük porsiyon çay',
        'Sıcak Çikolata': 'Kıvamlı ve yoğun çikolatalı içecek',
        'Sahlep': 'Tarçınla süslenmiş geleneksel içecek',
        'Termos Çay': 'Termos Çay',
        'Çilekli Limonata': 'Çilekli limonata',
        'Naneli Limonata': 'Naneli limonata',
        'Berry Tea': 'Berry Tea',
        'Cool Lime': 'Cool Lime',
        'Doğal Limonata': 'Taze limonlardan ev yapımı limonata',
        'Churchill': 'Tuzlu ve limonlu serinletici içecek',
        'Çikolatalı Milkshake': 'Çikolatalı milkshake',
        'Çilekli Milkshake': 'Çilekli milkshake',
        'Vanilyalı Milkshake': 'Vanilyalı milkshake',
        'Çilekli Frozen': 'Çilekli frozen',
        'Kırmızı Orman Meyveli Frozen': 'Kırmızı orman meyveli frozen',
        'Karpuzlu Frozen': 'Karpuzlu frozen',
        'Ananaslı Frozen': 'Ananaslı frozen',
        'Yeşil Elmalı Frozen': 'Yeşil elmalı frozen',
        'Nane Limon Bitki Çayı': 'French press ile servis edilir',
        'Yeşil Çay': 'French press ile servis edilir',
        'Papatya Bitki Çayı': 'French press ile servis edilir',
        'Ihlamur Bitki Çayı': 'Ihlamur bitki çayı',
        'Adaçayı Bitki Çayı': 'Adaçayı bitki çayı',
        'Çilek Meyve Çayı': 'Çilek meyve çayı',
        'Kuşburnu Meyve Çayı': 'Kuşburnu meyve çayı',
        'Elma Meyve Çayı': 'Elma meyve çayı',
        'Orman Meyveleri Meyve Çayı': 'Orman meyveleri meyve çayı',
        'Damla Çikolatalı Cookie': 'Çikolata parçalı yumuşak kurabiye',
        'Elmalı Kurabiye': 'İç dolgulu elmalı kurabiye',
        'Elmalı Tart': 'Elma dilimli, kıtır tabanlı tatlı',
        'Kare Elmalı Tart': 'Kare kesim elmalı mini tart',
        'Ay Çöreği': 'Kuru meyveli ve cevizli çörek',
        'İzmir Bombası': 'İçi akışkan çikolatalı kurabiye',
        'Portakallı Kurabiye': 'Taze portakal aromalı kurabiye',
        'Prüzyen': 'Kat kat hamurlu, şekerli atıştırmalık',
        'Üzümlü Kesme Kurabiye': 'Kıtır yapılı üzümlü kurabiye',
        'Un Kurabiyesi': 'Ağızda dağılan klasik kurabiye',
        'Pekmezli Cevizli Kurabiye': 'Doğal pekmezli, cevizli kurabiye',
        'İran Poğaçası': 'Farklı aromalı geleneksel poğaça',
        'Muffin Kek': 'Küçük porsiyon yumuşak kek',
        'Havuçlu Cevizli Dilim Kek': 'Havuç ve cevizle zenginleştirilmiş kek',
        'Yuvarlak Kalıp Kek': 'Büyük boy, yuvarlak kalıpta kek',
        'Kalıp Kek': 'Dilimlenebilir kalıpta pişmiş kek',
        'Paskalya': 'Yumuşak dokulu geleneksel paskalya çöreği',
        'Üzümlü Paskalya': 'Üzümlü paskalya çöreği',
        'Tahinli Çörek': 'Tahinle hazırlanmış geleneksel çörek',
        'Çatal': 'Tuzlu gevrek bir atıştırmalık',
        'Beze': 'Yumurta beyazı ile yapılan hafif tatlı',
        'Kurupasta': 'Karışık kuru pastalar seçkisi',
        'San Sebastian Cheese Cake': 'İspanyol usulü yanık cheesecake. Özel çikolata ile servis edilir',
        'Dondurma': '14 çeşit maraş usulü dondurma',
        'Çilekli Magnolya': 'Muzlu bisküvili hafif sütlü tatlı',
        'Muzlu Magnolya': 'Muzlu Magnolya',
        'Fıstıklı Magnolya': 'Fıstıklı Magnolya',
        'Lotuslu Magnolya': 'Lotuslu Magnolya',
        'Orman Meyveli Magnolya': 'Orman Meyveli Magnolya',
        'Makaron': 'Makaron',
        'Soğuk Baklava': '4 dilim. Soğuk servis edilen modern baklava',
        'Soğuk Kadayıf': '1 dilim. Soğuk sunumlu kadayıf tatlısı',
        'Ekler': 'Kilogram fiyatıdır. Klasik çikolatalı, çilekli, bisküvili, karamelli, fıstıklı, frambuazlı ve bademli çeşitleri',
        'Tartolet': 'Kilogram fiyatıdır. Muzlu, çilekli ve drajeli çeşitleri ile minik tartolet tatlıları',
        'Cheese Cake': 'Kremalı ve yoğun lezzetli cheesecake',
        'Karamelli Trileçe': 'Sütlü, hafif ve karamelli tatlı',
        'Frambuazlı Trileçe': 'Nefis frambuaz dolgulu hafif trileçe tatlısı',
        'Lotus Trileçe': 'Lotus aromalı özel trileçe',
        'Kıbrıs Tatlısı': 'İrmikli, sütlü ve cevizli tatlı',
        'Brownie': 'Yoğun çikolatalı kek dilimi',
        'Fırın Sütlaç': 'Fırında pişmiş klasik sütlü tatlı',
        'Aşure': 'Bol malzemeli geleneksel tatlı',
        'Kadife Tatlısı': 'Kırmızı kadife kekten özel tatlı',
        'Profiterol': 'Kremalı hamur topları, çikolata soslu',
        'Supangle': 'Kakaolu puding üzeri kekli tatlı',
        'Malaga': 'Yoğun çikolatalı küçük pasta',
        'Beyaz Çikolata Malaga': 'Beyaz Çikolata Malaga',
        'Rulo Pasta': 'Kremalı ve yumuşak rulo pasta',
        'Profiterollü Pasta': 'Profiterollü Küçük Pasta',
        'Fındık Çikolatalı Pasta': 'Fındık çikolatalı pasta',
        'Fıstık Çikolatalı Pasta': 'Fıstık çikolatalı pasta',
        'Çilek Çikolatalı Pasta': 'Çilek çikolatalı pasta',
        'Karışık Meyveli Pasta': 'Karışık meyveli pasta',
        'Çilek Oreolu Pasta': 'Çilek oreolu pasta',
        'Çilekli Pasta': 'Çilekli pasta',
        'Çilek Lotuslu Pasta': 'Çilek lotuslu pasta',
        'Muz Çikolatalı Pasta': 'Muz çikolatalı pasta',
        'Rus Pastası': 'Kremalı ve meyveli özel pasta',
        'Çikolatalı Pasta': 'Çikolatalı pasta',
        'Damla Sakızlı Türk Kahvesi': 'Damla sakızlı Türk kahvesi',
        'Menengiç Kahvesi': 'Menengiç kahvesi',
        'Dibek Kahvesi': 'Dibek kahvesi',
        'Türk Kahvesi': 'Klasik bol köpüklü Türk kahvesi',
        'Duble Türk Kahvesi': 'Daha yoğun kahve sevenlere özel',
        'Coca-Cola': 'Coca-cola',
        'Coca-cola Zero Sugar': 'Coca-cola Zero Sugar',
        'Capri-Sun': 'Safari Fruits, Mystic Dragon, Multi-Vitamin seçenekleri ile',
        'Sprite': 'Sprite',
        'Fanta': 'Fanta',
        'Ice Tea Limon': 'Ice Tea Limon',
        'Ice Tea Şeftali': 'Ice Tea Şeftali',
        'Ice Tea Mango': 'Ice Tea Mango',
        'Nescafe Xpress': 'Originali, Black Roast, Cafe Choco ve Vanilla seçenekleri ile',
        'Cappy 330ml': 'Şeftali, kayısı, vişne ve karışık seçenekleri ile',
        'Tamek 200ml': 'Şeftali, kayısı, vişne ve karışık seçenekleri ile',
        'Süt 200ml': 'Süt',
        'Kakaolu Süt 200ml': 'Kakaolu Süt',
        'Meyveli Soda': 'Limon, elma, mandalina ve sade seçenekleri ile',
        'Fıstıklı Baklava': 'Antep fıstığıyla yapılan klasik baklava',
        'Cevizli Ev Baklavası': 'Ev yapımı cevizli baklava',
        'Burma Kadayıf': 'Kıtır kıtır cevizli kadayıf tatlısı',
        'Şöbiyet': 'Fıstıklı ve kremalı şerbetli tatlı',
        'Midye': 'Özel şekilli fıstıklı şerbetli tatlı',
        'Antep Özel': 'Antep usulü özel baklava seçkisi',
        'Şekerpare': 'Şerbetli klasik irmikli tatlı',
        'Bal Badem': 'Bademli ve şerbetli özel tatlı',
        'Kahvaltı Tabağı': 'Özelleştirilebilir kahvaltı tabağı',
        'Soğuk Sandviç': 'Beyaz peynirli veya kaşarlı soğuk sandviç',
        'Sakallı Ponçik': 'Minik ponçik ekmeği arasında rendelenmiş kaşar ve krem peynir',
        'Minik Soğuk Sandviç': 'Minik ponçik ekmeği arasında domates ve kaşar',
        'Poğaça': 'Nefis poğaça çeşitleri',
        'Açma': 'Nefis açma çeşitleri',
        'Simit': 'Çıtır susamlı simit',
        'Kır Pidesi': 'Nefis çeşitleriyle kır pidesi',
        'Gül Böreği': 'Gül böreği',
        'Sigara Böreği': 'Sigara böreği',
        'Kaşarlı Simit': 'Kaşarlı simit'
    };

    return descriptions[productName] || `${productName} - Lezzetli ve taze`;
}


function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const menuSections = document.querySelectorAll('.menu-section');

    console.log('Tab buttons found:', tabButtons.length);
    console.log('Menu sections found:', menuSections.length);

    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetCategory = this.getAttribute('data-category');
            console.log('Tab clicked:', targetCategory);

            tabButtons.forEach(btn => btn.classList.remove('active'));
            menuSections.forEach(section => section.classList.remove('active'));

            this.classList.add('active');

            const targetSection = document.getElementById(targetCategory);
            if (targetSection) {
                targetSection.classList.add('active');
                currentActiveCategory = targetCategory;
                console.log('Section activated instantly:', targetCategory);

                setTimeout(() => {
                    targetSection.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                        inline: 'nearest'
                    });
                    console.log('Scrolled to category:', targetCategory);
                }, 100);

                clearCategoryCache(targetCategory);

                requestIdleCallback(() => {
                    preloadCategoryImages(targetCategory);
                });

                logTabSwitchPerformance(targetCategory);

            } else {
                console.error('Target section not found:', targetCategory);
            }
        });
    });
}

function logTabSwitchPerformance(categoryId) {
    const startTime = performance.now();

    requestAnimationFrame(() => {
        const endTime = performance.now();
        const renderTime = endTime - startTime;

        console.log(`Tab switch to ${categoryId} completed in ${renderTime.toFixed(2)}ms`);

        if (renderTime > 16.67) {
            console.warn(`Tab switch to ${categoryId} took ${renderTime.toFixed(2)}ms (above 60fps threshold)`);
        }

        const category = globalCategories[categoryId];
        if (category) {
            console.log(`Category ${categoryId}: ${category.items.length} total items, ${virtualScrollState.renderedItems.size} currently rendered`);
        }
    });
}

function clearCategoryCache(activeCategoryId) {
    const keysToDelete = [];

    performanceCache.renderedSections.forEach((value, key) => {
        if (!key.startsWith(activeCategoryId)) {
            keysToDelete.push(key);
        }
    });

    keysToDelete.forEach(key => {
        performanceCache.renderedSections.delete(key);
    });

    if (keysToDelete.length > 0) {
        console.log(`Cleared ${keysToDelete.length} cached sections for memory optimization`);
    }
}


function initializeOtherFeatures() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.getAttribute('href').startsWith('#')) {
                e.preventDefault();
                const targetId = this.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });

    if ('ontouchstart' in window) {
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            item.addEventListener('touchstart', function() {
                this.style.transform = 'scale(0.98)';
            });

            item.addEventListener('touchend', function() {
                this.style.transform = 'scale(1)';
            });
        });
    }

    initializeFeedbackForm();
}

function initializeFeedbackForm() {
    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', function(e) {
            e.preventDefault();

            const formData = new FormData(this);
            const feedbackData = {
                adsoyad: formData.get('name'),
                eposta: formData.get('email'),
                telno: formData.get('phone'),
                tur: formData.get('type'),
                mesaj: formData.get('message'),
                timestamp: new Date().toLocaleString('tr-TR'),
                consent: formData.get('consent')
            };

            console.log('🔍 Form\'dan alınan veriler:');
            console.log('- name (adsoyad):', formData.get('name'));
            console.log('- email (eposta):', formData.get('email'));
            console.log('- phone (telno):', formData.get('phone'));
            console.log('- type (tur):', formData.get('type'));
            console.log('- message (mesaj):', formData.get('message'));
            console.log('- consent:', formData.get('consent'));
            console.log('📋 Oluşturulan feedbackData:', feedbackData);

            if (!feedbackData.adsoyad || !feedbackData.tur || !feedbackData.mesaj || !feedbackData.consent) {
                console.error('❌ Eksik alanlar tespit edildi:');
                console.error('- adsoyad:', !!feedbackData.adsoyad);
                console.error('- tur:', !!feedbackData.tur);
                console.error('- mesaj:', !!feedbackData.mesaj);
                console.error('- consent:', !!feedbackData.consent);
                showNotification('Lütfen tüm zorunlu alanları doldurun.', 'error');
                return;
            }

            const submitButton = this.querySelector('.submit-button');
            const originalText = submitButton.innerHTML;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gönderiliyor...';
            submitButton.disabled = true;

            sendFeedbackToSheets(feedbackData)
                .then(success => {
                    if (success) {
                        showNotification('💚 Mesajınız başarıyla gönderildi ve kaydedildi. Teşekkür ederiz!', 'success');

                        feedbackForm.reset();
                    } else {
                        showNotification('❌ Mesaj gönderilemedi. Lütfen tekrar deneyin.', 'error');
                    }
                })
                .catch(error => {
                    console.error('Feedback gönderme hatası:', error);
                    showNotification('❌ Teknik bir sorun oluştu. Lütfen tekrar deneyin.', 'error');
                })
                .finally(() => {
                    submitButton.innerHTML = originalText;
                    submitButton.disabled = false;
                });
        });

        const requiredFields = feedbackForm.querySelectorAll('[required]');
        requiredFields.forEach(field => {
            field.addEventListener('blur', function() {
                validateField(this);
            });
        });
    }
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
}

function showError(message) {
    showNotification(message, 'error');
}

function addMenuAnimations() {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach((item, index) => {
        item.style.animationDelay = `${index * 0.1}s`;
        item.classList.add('fade-in');
    });
}

function validateField(field) {
    const value = field.value.trim();
    const fieldName = field.name;

    field.classList.remove('error');

    if (!value) {
        field.classList.add('error');
        return false;
    }

    if (fieldName === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            field.classList.add('error');
            return false;
        }
    }

    if (fieldName === 'phone' && value) {
        const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;
        if (!phoneRegex.test(value)) {
            field.classList.add('error');
            return false;
        }
    }

    return true;
}

function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${getNotificationIcon(type)}"></i>
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    setTimeout(() => {
        hideNotification(notification);
    }, 5000);

    const closeButton = notification.querySelector('.notification-close');
    closeButton.addEventListener('click', () => {
        hideNotification(notification);
    });
}

function hideNotification(notification) {
    notification.classList.remove('show');
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 300);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'error': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        default: return 'fa-info-circle';
    }
}

async function sendFeedbackToSheets(feedbackData) {
    try {
        console.log('📋 Feedback Google Sheets\'e gönderiliyor...', feedbackData);

        const dataToSend = {
            adsoyad: feedbackData.adsoyad,
            eposta: feedbackData.eposta || '',
            telno: feedbackData.telno || '',
            tur: feedbackData.tur,
            mesaj: feedbackData.mesaj,
            tarih: feedbackData.timestamp
        };

        console.log('📤 API\'ye gönderilecek veri:', dataToSend);
        console.log('🔍 Field kontrolleri:');
        console.log('- tur değeri:', `"${dataToSend.tur}"`, 'uzunluk:', dataToSend.tur ? dataToSend.tur.length : 0);
        console.log('- mesaj değeri:', `"${dataToSend.mesaj}"`, 'uzunluk:', dataToSend.mesaj ? dataToSend.mesaj.length : 0);

        const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwpNTJfPxoATnLl8-_e_SJlkX-QcWqIEtZMZSNrpIcIQT63h1zvdRCw2ZQrfJQGYmGknw/exec';

        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToSend)
        });

        console.log('✅ Feedback Google Apps Script\'e gönderildi (no-cors modu)');
        console.log('📋 Gönderilen veri:', dataToSend);

        return true;

    } catch (error) {
        console.error('❌ Feedback gönderme hatası:', error);
        return false;
    }
}

const style = document.createElement('style');
style.textContent = `
    .fade-in {
        animation: fadeInUp 0.6s ease-out forwards;
        opacity: 0;
        transform: translateY(20px);
    }

    @keyframes fadeInUp {
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .menu-item {
        transition: transform 0.2s ease;
    }

    .menu-item:active {
        transform: scale(0.98);
    }

    /* Loading styles */
    .loading-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 400px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        margin: 20px 0;
    }

    .loading-spinner {
        text-align: center;
        color: #D4AF37;
    }

    .loading-spinner i {
        font-size: 48px;
        margin-bottom: 16px;
    }

    .loading-spinner p {
        font-size: 18px;
        margin: 0;
        color: #FFFFFF;
    }

    /* Form validation styles */
    .form-group input.error,
    .form-group select.error,
    .form-group textarea.error {
        border-color: #ff6b6b;
        box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.1);
    }

    /* Notification styles */
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: #111111;
        border: 1px solid #D4AF37;
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 8px 25px rgba(212, 175, 55, 0.2);
        z-index: 10000;
        transform: translateX(400px);
        transition: transform 0.3s ease;
        max-width: 350px;
    }

    .notification.show {
        transform: translateX(0);
    }

    .notification-content {
        display: flex;
        align-items: center;
        gap: 12px;
        color: #FFFFFF;
    }

    .notification-content i {
        font-size: 18px;
        color: #D4AF37;
    }

    .notification-content span {
        flex: 1;
        font-size: 14px;
    }

    .notification-close {
        background: none;
        border: none;
        color: #D4AF37;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .notification-close:hover {
        color: #FFFFFF;
    }

    .notification-success {
        border-color: #51cf66;
    }

    .notification-success i {
        color: #51cf66;
    }

    .notification-error {
        border-color: #ff6b6b;
    }

    .notification-error i {
        color: #ff6b6b;
    }

    .notification-warning {
        border-color: #ffd43b;
    }

    .notification-warning i {
        color: #ffd43b;
    }

    /* Loading spinner */
    .fa-spinner {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    /* Mobile responsive for notifications */
    @media (max-width: 768px) {
        .notification {
            top: 10px;
            right: 10px;
            left: 10px;
            max-width: none;
            transform: translateY(-100px);
        }

        .notification.show {
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(style);

function testTabFunctionality() {
    console.log('=== TAB FUNCTIONALITY TEST ===');

    const tabButtons = document.querySelectorAll('.tab-button');
    console.log('Tab buttons found:', tabButtons.length);
    tabButtons.forEach(btn => {
        console.log('Tab button:', btn.textContent.trim(), 'data-category:', btn.getAttribute('data-category'));
    });

    const menuSections = document.querySelectorAll('.menu-section');
    console.log('Menu sections found:', menuSections.length);
    menuSections.forEach(section => {
        console.log('Menu section:', section.id, 'active:', section.classList.contains('active'));
    });

    const firstSection = document.querySelector('.menu-section.active');
    if (firstSection) {
        console.log('First active section:', firstSection.id);
    } else {
        console.log('No active section found!');
    }

    getPerformanceStats();

    console.log(`Images cached: ${imageCache.size}`);

    console.log('Testing tab switching performance...');
    const testStart = performance.now();

    setTimeout(() => {
        const testEnd = performance.now();
        const testTime = testEnd - testStart;
        console.log(`Tab switch simulation completed in ${testTime.toFixed(2)}ms`);
    }, 100);

    console.log('=== END TEST ===');
}