'use strict';
/**
 * add event on element
 */

const addEventOnElem = function (elem, type, callback) {
  if (elem.length > 1) {
    for (let i = 0; i < elem.length; i++) {
      elem[i].addEventListener(type, callback);
    }
  } else {
    elem.addEventListener(type, callback);
  }
}



/**
 * navbar toggle
 */

const navTogglers = document.querySelectorAll("[data-nav-toggler]");
const navbar = document.querySelector("[data-navbar]");
const navbarLinks = document.querySelectorAll("[data-nav-link]");
const overlay = document.querySelector("[data-overlay]");

const toggleNavbar = function () {
  navbar.classList.toggle("active");
  overlay.classList.toggle("active");
}

addEventOnElem(navTogglers, "click", toggleNavbar);

const closeNavbar = function () {
  navbar.classList.remove("active");
  overlay.classList.remove("active");
}

addEventOnElem(navbarLinks, "click", closeNavbar);

/**
 * header sticky & back top btn active
*/

const header = document.querySelector("[data-header]");
const backTopBtn = document.querySelector("[data-back-top-btn]");

const headerActive = function () {
  if (window.scrollY > 150) {
    header.classList.add("active");
    backTopBtn.classList.add("active");
  } else {
    header.classList.remove("active");
    backTopBtn.classList.remove("active");
  }
}

addEventOnElem(window, "scroll", headerActive);

let lastScrolledPos = 0;

const headerSticky = function () {
  if (lastScrolledPos >= window.scrollY) {
    header.classList.remove("header-hide");
  } else {
    header.classList.add("header-hide");
  }

  lastScrolledPos = window.scrollY;
}


addEventOnElem(window, "scroll", headerSticky);


/**
 * scroll reveal effect
 */

const sections = document.querySelectorAll("[data-section]");

const scrollReveal = function () {
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].getBoundingClientRect().top < window.innerHeight / 2) {
      sections[i].classList.add("active");
    }
  }
}

//3 SANİYEDE BİR DEĞİŞEN SLİDER ALAN
scrollReveal();

addEventOnElem(window, "scroll", scrollReveal);
document.addEventListener('DOMContentLoaded', function() {
  const slider = document.querySelector('.slider');
  const prevBtn = document.querySelector('.prev-slide-btn');
  const nextBtn = document.querySelector('.next-slide-btn');
  let slideIndex = 0;
  let slideInterval;

  function showSlide(index) {
    slider.style.transform = `translateX(-${index * 100}%)`;
  }

  function nextSlide() {
    slideIndex = (slideIndex === slider.children.length - 1) ? 0 : (slideIndex + 1);
    showSlide(slideIndex);
  }

  prevBtn.addEventListener('click', function() {
    slideIndex = (slideIndex === 0) ? (slider.children.length - 1) : (slideIndex - 1);
    showSlide(slideIndex);
  });

  nextBtn.addEventListener('click', nextSlide);

  function startSlideShow() {
    slideInterval = setInterval(nextSlide, 3000); // 3 saniyede bir slayt değiştir
  }

  function stopSlideShow() {
    clearInterval(slideInterval);
  }

  // Otomatik slayt değiştirme özelliğini başlat
  startSlideShow();

  // Kullanıcı fareyle slider'a geldiğinde otomatik slayt değiştirme özelliğini duraklat
  slider.addEventListener('mouseenter', stopSlideShow);

  // Kullanıcı fareyi slider'dan çıkardığında otomatik slayt değiştirme özelliğini başlat
  slider.addEventListener('mouseleave', startSlideShow);
});


// API ve Auth yardımcıları + Sepet entegrasyonu
const API_BASE = 'http://localhost:4000';

function getAuthToken() {
  try { return localStorage.getItem('authToken'); } catch (_) { return null; }
}

function setAuthToken(token) {
  try { localStorage.setItem('authToken', token); } catch (_) {}
}

function isAuthenticated() {
  return Boolean(getAuthToken());
}

async function apiFetch(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const token = getAuthToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const response = await fetch(API_BASE + path, { ...options, headers });
  if (!response.ok) {
    let message = 'İstek başarısız';
    try { const data = await response.json(); if (data && data.error) message = data.error; } catch (_) {}
    throw new Error(message);
  }
  return response.json();
}

function parsePriceFromText(text) {
  if (!text) return 0;
  const cleaned = text.toString().replace(/[\s₺]/g, '').replace(/\./g, '').replace(/,/g, '.');
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

function getProductInfoFromButton(button) {
  const card = button.closest('.shop-card');
  const nameElement = card ? card.querySelector('.card-title') : null;
  const priceElement = card ? card.querySelector('.price .span') : null;
  const productName = nameElement ? nameElement.textContent.trim() : 'Ürün';
  const unitPrice = priceElement ? parsePriceFromText(priceElement.textContent) : 0;
  return { productName, unitPrice };
}

function updateHeaderCartUI(items, total) {
  const btnText = document.querySelector('.btn-text');
  const btnBadge = document.querySelector('.btn-badge2');
  const count = Array.isArray(items) ? items.reduce((sum, it) => sum + (it.quantity || 0), 0) : 0;
  if (btnBadge) btnBadge.textContent = String(count);
  if (btnText) btnText.textContent = '₺' + (Number(total || 0)).toFixed(2);
}

function showAlert(message) {
  var alertBox = document.createElement('div');
  alertBox.textContent = message;
  alertBox.style.cssText = 'color:white; position: fixed; top: 17%; left: 50%; transform: translate(-50%, -50%); padding: 10px; background-color: black; border: 1px solid #ccc; border-radius: 5px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3); z-index: 9999;';
  document.body.appendChild(alertBox);
  setTimeout(function() {
    if (alertBox && alertBox.parentNode) alertBox.parentNode.removeChild(alertBox);
  }, 1200);
}

async function refreshCartModal() {
  const cartList = document.getElementById('cartItems');
  const totalEl = document.getElementById('totalPrice');
  if (!isAuthenticated()) {
    if (cartList) cartList.innerHTML = '<li>Sepeti görmek için giriş yapınız.</li>';
    if (totalEl) totalEl.textContent = '₺0.00';
    return;
  }
  try {
    const { items, total } = await apiFetch('/api/cart', { method: 'GET' });
    if (cartList) {
      cartList.innerHTML = '';
      items.forEach(function(it) {
        const li = document.createElement('li');
        const lineTotal = Number(it.unit_price || 0) * Number(it.quantity || 0);
        li.textContent = (it.quantity || 0) + ' x ' + (it.product_name || 'Ürün') + ' - ₺' + lineTotal.toFixed(2);
        cartList.appendChild(li);
      });
    }
    if (totalEl) totalEl.textContent = '₺' + Number(total || 0).toFixed(2);
    updateHeaderCartUI(items, total);
  } catch (e) {
    if (cartList) cartList.innerHTML = '<li>Sepet yüklenemedi.</li>';
  }
}

function openCartModal() {
  const cartModal = document.getElementById('cartModal');
  if (cartModal) {
    cartModal.style.display = 'block';
    refreshCartModal();
  }
}

function closeCartModal() {
  const cartModal = document.getElementById('cartModal');
  if (cartModal) {
    cartModal.style.display = 'none';
  }
}

// global erişim gereken fonksiyonlar
window.openCartModal = openCartModal;
window.closeCartModal = closeCartModal;

//FAVORİLERE ÜRÜN EKLEME FONKSİYONU
document.addEventListener('DOMContentLoaded', function() {
  const addToWishlistButtons = document.querySelectorAll('.action-btn[aria-label="add to whishlist"]');
  const btnBadge = document.querySelector('.btn-badge');

  let favoriteItemCount = 0;

  addToWishlistButtons.forEach(function(button) {
    button.addEventListener('click', function() {
      favoriteItemCount++; // Favoriye ekleme sayısını artır
      btnBadge.textContent = favoriteItemCount; // Favoriye ekleme sayısını güncelle
      function showAlert(message) {
        var alertBox = document.createElement('div');
        alertBox.textContent = message;
        alertBox.style.cssText = 'color:white; position: fixed; top: 17%; left: 50%; transform: translate(-50%, -50%); padding: 10px; background-color: black; border: 1px solid #ccc; border-radius: 5px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);';
        document.body.appendChild(alertBox);
    
        setTimeout(function() {
            alertBox.parentNode.removeChild(alertBox);
        }, 1000); // 1 saniye sonra alert kutusunu kaldır
    }
    
    showAlert('Ürün favoriye eklendi!');
    
    });
  });
});


//KULLANICI GİRİŞ VE KAYIT FONKSİYONU (Backend entegrasyonlu)
// Modalı aç
function openLoginForm() {
  document.getElementById('loginModal').style.display = 'block';
}

// Modalı kapat
function closeLoginForm() {
  document.getElementById('loginModal').style.display = 'none';
}

// Kayıt formunu göster
function showRegisterForm() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'block';
}

async function login() {
  const username = document.getElementById('username')?.value?.trim();
  const password = document.getElementById('password')?.value || '';
  if (!username || !password) { showAlert('Kullanıcı adı ve şifre gerekli'); return; }
  try {
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    setAuthToken(data.token);
    showAlert('Giriş başarılı');
    closeLoginForm();
    refreshCartModal();
  } catch (e) {
    showAlert(e.message || 'Giriş başarısız');
  }
}

async function register() {
  const username = document.getElementById('newUsername')?.value?.trim();
  const password = document.getElementById('newPassword')?.value || '';
  if (!username || !password) { showAlert('Kullanıcı adı ve şifre gerekli'); return; }
  try {
    const data = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    setAuthToken(data.token);
    showAlert('Kayıt başarılı, giriş yapıldı');
    closeLoginForm();
    refreshCartModal();
  } catch (e) {
    showAlert(e.message || 'Kayıt başarısız');
  }
}

window.login = login;
window.register = register;
window.showRegisterForm = showRegisterForm;
window.openLoginForm = openLoginForm;
window.closeLoginForm = closeLoginForm;


//SEPET İÇERİĞİ FONKSİYONU
document.addEventListener("DOMContentLoaded", function() {
  const addToCartButtons = document.querySelectorAll('.action-btn[aria-label="add to cart"]');
  const headerCartButton = document.querySelector('.header-action-btn[aria-label="cart item"]');
  const closeCartButton = document.querySelector('.close');

  if (headerCartButton) {
    headerCartButton.addEventListener('click', () => {
      if (!isAuthenticated()) {
        showAlert('Sepeti görmek için giriş yapın');
        openLoginForm();
        return;
      }
      openCartModal();
    });
  }

  if (closeCartButton) {
    closeCartButton.addEventListener('click', () => {
      closeCartModal();
    });
  }

  addEventOnElem(addToCartButtons, 'click', async function(event) {
    const button = event.currentTarget || this;
    if (!isAuthenticated()) {
      showAlert('Sepete eklemek için lütfen giriş yapın');
      openLoginForm();
      return;
    }
    try {
      const { productName, unitPrice } = getProductInfoFromButton(button);
      const data = await apiFetch('/api/cart/items', { method: 'POST', body: JSON.stringify({ productName, unitPrice, quantity: 1 }) });
      updateHeaderCartUI(data.items, data.total);
      showAlert('Ürün sepete eklendi!');
    } catch (e) {
      showAlert(e.message || 'Sepete eklenemedi');
    }
  });
});