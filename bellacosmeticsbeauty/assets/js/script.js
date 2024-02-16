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


//SEPETE ÜRÜN EKLEME FONKSİYONU
document.addEventListener('DOMContentLoaded', function() {
  // Sepet bilgilerini tutacak değişkenler
  let itemCount = 0;
  let totalPrice = 0;

  // Sepete ürün ekleme işlevi
  function addToCart(price) {
    itemCount++; // Ürün sayısını arttır
    totalPrice += price; // Toplam fiyata eklenen ürünün fiyatını ekle
    updateCart(); // Sepet bilgilerini güncelle
  }

  // Sepet bilgilerini güncelleme işlevi
  function updateCart() {
    const btnText = document.querySelector('.btn-text');
    const btnBadge = document.querySelector('.btn-badge2');

    btnBadge.textContent = itemCount; // Ürün sayısını göster
    btnText.textContent = '₺' + totalPrice.toFixed(2); // Toplam fiyatı göster
  }

  // Ürün ekleme butonlarını seç
  const addToCartButtons = document.querySelectorAll('.action-btn[aria-label="add to cart"]');

  // Her bir ürün ekleme butonuna tıklandığında
  addToCartButtons.forEach(function(button) {
    button.addEventListener('click', function() {
      const priceElement = button.closest('.shop-card').querySelector('.price .span');
      const price = parseFloat(priceElement.textContent.replace(',', '.')); // Fiyatı alma ve virgülü noktaya çevirme
      addToCart(price); // Sepete ürün ekle
      function showAlert(message) {
        var alertBox = document.createElement('div');
        alertBox.textContent = message;
        alertBox.style.cssText = 'color:white; position: fixed; top: 17%; left: 50%; transform: translate(-50%, -50%); padding: 10px; background-color: black; border: 1px solid #ccc; border-radius: 5px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);';
        document.body.appendChild(alertBox);
    
        setTimeout(function() {
            alertBox.parentNode.removeChild(alertBox);
        }, 1000); // 1 saniye sonra alert kutusunu kaldır
    }
  
    showAlert('Ürün sepete eklendi!');
    
    });
  });
});

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


//KULLANICI GİRİŞ VE KAYIT FONKSİYONU
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

// Giriş işlemi
function login() {
  // Giriş işlemleri burada yapılacak
  alert('Giriş yapıldı!');
  window.location.href = 'index.html';
}

// Kayıt işlemi
function register() {
  // Kayıt işlemleri burada yapılacak
  alert('Kayıt olundu! Lütfen giriş yapınız.');
  // Kayıt işlemi tamamlandıktan sonra tekrar giriş formunu göster
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('registerForm').style.display = 'none';
}


//SEPET İÇERİĞİ FONKSİYONU
document.addEventListener("DOMContentLoaded", function() {
  const addToCartButtons = document.querySelectorAll('.action-btn[aria-label="add to cart"]');
  const headerCartButton = document.querySelector('.header-action-btn[aria-label="cart item"]');
  const closeCartButton = document.querySelector('.close');


  if (headerCartButton) {
    headerCartButton.addEventListener('click', () => {
      updateCart('Ürün mevcut ', 0, 0.00); // Örnek değerler, istediğiniz gibi değiştirin
      openCartModal();
    });
  }

  if (closeCartButton) {
    closeCartButton.addEventListener('click', () => {
      closeCartModal();
    });
  }

  function updateCart(name, quantity, totalPrice) {
    const cartInfo = document.querySelector('.cart-info');
    cartInfo.innerText = `Sepette ${quantity} adet ${name} - Toplam: ₺${totalPrice.toFixed(2)}`;
  }

  function openCartModal() {
    const cartModal = document.getElementById('cartModal');
    if (cartModal) {
      cartModal.style.display = 'block';
    }
  }

  function closeCartModal() {
    const cartModal = document.getElementById('cartModal');
    if (cartModal) {
      cartModal.style.display = 'none';
    }
  }
});