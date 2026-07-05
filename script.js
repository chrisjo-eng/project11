/* ============================================================
   SARAH FASHIONS — Shared Logic (Supabase version, v2)
   ============================================================ */

/* ---- FILL THESE IN from Supabase → Project Settings → API ---- */
const SUPABASE_URL = "https://beeziwxvuteerudthmlp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_icvBPjTLOKL63Nj2TzZkZA_D6RTfqr8";
/* ---------------------------------------------------------------- */

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const AUTH_KEY = "sf_seller_authed"; // sessionStorage flag, browser-only
const CART_KEY = "sf_cart";          // localStorage, per-visitor basket

/* ---------------- Categories ---------------- */

async function getCategories() {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error loading categories:", error.message);
    return [];
  }
  return data;
}

async function addCategory(name, parentId = null) {
  const clean = name.trim();
  if (!clean) return { error: "Category name can't be empty." };

  const { error } = await supabaseClient
    .from("categories")
    .insert({ name: clean, parent_id: parentId || null });

  if (error) return { error: error.message };
  return { error: null };
}

async function deleteCategory(id) {
  const { error } = await supabaseClient.from("categories").delete().eq("id", id);
  if (error) console.error("Error deleting category:", error.message);
}

/* ---- Category tree helpers ---- */

function buildCategoryTree(categories) {
  const byId = {};
  categories.forEach((c) => (byId[c.id] = { ...c, children: [] }));

  const roots = [];
  categories.forEach((c) => {
    if (c.parent_id && byId[c.parent_id]) {
      byId[c.parent_id].children.push(byId[c.id]);
    } else {
      roots.push(byId[c.id]);
    }
  });
  return roots;
}

function flattenCategoryTree(tree, depth = 0, parentPath = "") {
  let result = [];
  tree.forEach((node) => {
    const path = parentPath ? `${parentPath} > ${node.name}` : node.name;
    result.push({ id: node.id, name: node.name, depth, path });
    if (node.children.length) {
      result = result.concat(flattenCategoryTree(node.children, depth + 1, path));
    }
  });
  return result;
}

function getCategoryPath(categoryId, categories) {
  const byId = {};
  categories.forEach((c) => (byId[c.id] = c));

  const path = [];
  let current = byId[categoryId];
  while (current) {
    path.unshift(current.name);
    current = current.parent_id ? byId[current.parent_id] : null;
  }
  return path;
}

/* ---------------- Products ---------------- */

async function getProducts() {
  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading products:", error.message);
    return [];
  }
  return data;
}

async function getProductById(id) {
  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error loading product:", error.message);
    return null;
  }
  return data;
}

async function addProduct({ name, price, originalPrice, discountPercent, category, categoryId, stock, images, description }) {
  const { error } = await supabaseClient.from("products").insert({
    name: name.trim(),
    price: Number(price),
    original_price: originalPrice ? Number(originalPrice) : Number(price),
    discount_percent: Number(discountPercent) || 0,
    category: category.trim() || "Uncategorized",
    category_id: categoryId || null,
     stock: stock === null || stock === undefined ? null : Number(stock),
    image_url: images && images.length ? images[0] : null,
    images: images || [],
    description: description ? description.trim() : null
  });

  if (error) {
    console.error("Error adding product:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

async function deleteProduct(id) {
  const { error } = await supabaseClient.from("products").delete().eq("id", id);
  if (error) console.error("Error deleting product:", error.message);
}

/* ---------------- Image Upload ---------------- */

/* Uploads a File object to Supabase Storage and returns its public URL */
async function uploadProductImage(file) {
  if (!file) return null;

  const fileExt = file.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

  const { error } = await supabaseClient.storage
    .from("product-images")
    .upload(fileName, file);

  if (error) {
    console.error("Error uploading image:", error.message);
    return null;
  }

  const { data } = supabaseClient.storage.from("product-images").getPublicUrl(fileName);
  return data.publicUrl;
}
async function uploadProductImages(files) {
  const urls = [];
  for (const file of files) {
    const url = await uploadProductImage(file);
    if (url) urls.push(url);
  }
  return urls;
}

/* ---------------- Contact Messages ---------------- */

async function getMessages() {
  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading messages:", error.message);
    return [];
  }
  return data;
}

async function addMessage({ name, phone, product, message }) {
  const { error } = await supabaseClient.from("messages").insert({
    name: name.trim(),
    phone: phone.trim(),
    product: product || "General enquiry",
    message: message.trim()
  });

  if (error) console.error("Error sending message:", error.message);
}

async function deleteMessage(id) {
  const { error } = await supabaseClient.from("messages").delete().eq("id", id);
  if (error) console.error("Error deleting message:", error.message);
}

/* ---------------- Seller Auth (hashed password in DB) ---------------- */

async function hashText(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isSellerAuthed() {
  return sessionStorage.getItem(AUTH_KEY) === "true";
}

async function trySellerLogin(password) {
  const { data, error } = await supabaseClient
    .from("settings")
    .select("password_hash")
    .eq("id", 1)
    .single();

  if (error) {
    console.error("Error checking password:", error.message);
    return false;
  }

  const enteredHash = await hashText(password);
  if (enteredHash === data.password_hash) {
    sessionStorage.setItem(AUTH_KEY, "true");
    return true;
  }
  return false;
}

async function changeSellerPassword(currentPassword, newPassword) {
  const isCorrect = await trySellerLogin(currentPassword);
  if (!isCorrect) return { error: "Current password is incorrect." };

  const newHash = await hashText(newPassword);
  const { error } = await supabaseClient
    .from("settings")
    .update({ password_hash: newHash })
    .eq("id", 1);

  if (error) return { error: error.message };
  return { error: null };
}

function sellerLogout() {
  sessionStorage.removeItem(AUTH_KEY);
}
/* ---------------- Store Schedule ---------------- */

async function getStoreSchedule() {
  const { data, error } = await supabaseClient
    .from("settings")
    .select("open_time, close_time, is_closed")
    .eq("id", 1)
    .single();

  if (error) {
    console.error("Error loading store schedule:", error.message);
    return { open_time: "07:00", close_time: "20:00", is_closed: false };
  }
  return data;
}

async function updateStoreSchedule({ openTime, closeTime, isClosed }) {
  const { error } = await supabaseClient
    .from("settings")
    .update({ open_time: openTime, close_time: closeTime, is_closed: isClosed })
    .eq("id", 1);

  if (error) return { error: error.message };
  return { error: null };
}

function isStoreOpenNow(schedule) {
  if (schedule.is_closed) return false;
  const now = new Date();
  const [openH, openM] = schedule.open_time.split(":").map(Number);
  const [closeH, closeM] = schedule.close_time.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

function formatTime12h(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

async function applyStoreStatus() {
  const schedule = await getStoreSchedule();
  const open = isStoreOpenNow(schedule);
  const label = open
    ? `Open Now &middot; ${formatTime12h(schedule.open_time)} &ndash; ${formatTime12h(schedule.close_time)}`
    : `Closed &middot; Opens ${formatTime12h(schedule.open_time)}`;

  document.querySelectorAll(".status-pill").forEach((pill) => {
    pill.classList.toggle("closed", !open);
    pill.innerHTML = `<span class="dot ${open ? "green" : "red"}"></span> ${label}`;
  });
}

/* ---------------- Cart (local basket, no payment) ---------------- */

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function addToCart(product) {
  const cart = getCart();
  const existing = cart.find((item) => item.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      qty: 1
    });
  }
  saveCart(cart);
}

function removeFromCart(id) {
  saveCart(getCart().filter((item) => item.id !== id));
}

function clearCart() {
  saveCart([]);
}

function getCartCount() {
  return getCart().reduce((sum, item) => sum + item.qty, 0);
}

/* Turns the cart into a readable message and sends it as one enquiry */
async function sendCartEnquiry({ name, phone }) {
  const cart = getCart();
  if (!cart.length) return;

  const lines = cart.map(
    (item) => `${item.qty} x ${item.name} (KSh ${item.price.toLocaleString()} each)`
  );
  const total = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
  const message = `Cart enquiry:\n${lines.join("\n")}\n\nEstimated total: KSh ${total.toLocaleString()}`;

  await addMessage({ name, phone, product: "Cart enquiry", message });
  clearCart();
}

/* ---------------- Rendering (storefront) ---------------- */

function formatPrice(price) {
  return `KSh ${Number(price).toLocaleString()}`;
}

function buildProductCard(product) {
  const card = document.createElement("div");
  card.className = "sf-product-card";

  const imgWrapper = document.createElement("div");
  imgWrapper.className = "sf-image-wrapper";

  const img = document.createElement("div");
  img.className = "sf-product-image";
  if (product.image_url) {
    img.style.backgroundImage = `url('${product.image_url}')`;
  } else {
    img.classList.add("no-image");
    img.textContent = "No Image";
  }
  imgWrapper.appendChild(img);

  const category = document.createElement("span");
  category.className = "sf-product-category";
  category.textContent = product.category;

  const name = document.createElement("p");
  name.className = "sf-product-name";
  name.textContent = product.name;
const priceRow = document.createElement("div");
  priceRow.className = "sf-price-row";

  const price = document.createElement("span");
  price.className = "sf-product-price";
  price.textContent = formatPrice(product.price);
  priceRow.appendChild(price);

  if (product.discount_percent > 0 && product.original_price > product.price) {
    const original = document.createElement("span");
    original.className = "sf-original-price";
    original.textContent = formatPrice(product.original_price);
    priceRow.appendChild(original);

    const badge = document.createElement("span");
    badge.className = "sf-discount-badge";
    badge.textContent = `${product.discount_percent}% off`;
    priceRow.appendChild(badge);
  }

  card.appendChild(imgWrapper);
  card.appendChild(category);
  card.appendChild(name);
  card.appendChild(priceRow);

  // Clicking the card opens the product detail modal (storefront only)
  if (typeof openProductModal === "function") {
    card.addEventListener("click", () => openProductModal(product));
    card.style.cursor = "pointer";
  }

  return card;
}

async function renderStorefront(gridEl, emptyStateEl, activeCategory = "All") {
  const products = await getProducts();
  let filtered = products;

  if (activeCategory !== "All") {
    const categories = await getCategories();
    const matchingIds = getDescendantCategoryIds(activeCategory, categories);
    filtered = products.filter(
      (p) => p.category === activeCategory || matchingIds.includes(p.category_id)
    );
  }

  gridEl.innerHTML = "";
  filtered.forEach((p) => gridEl.appendChild(buildProductCard(p)));

  if (emptyStateEl) {
    emptyStateEl.style.display = filtered.length ? "none" : "block";
  }
}

async function searchProducts(term) {
  const products = await getProducts();
  const lower = term.trim().toLowerCase();
  if (!lower) return products;
  return products.filter((p) => p.name.toLowerCase().includes(lower));
}

async function renderCategoryPills(containerEl, onSelect) {
  const categories = await getCategories();
  const mainCategories = categories.filter((c) => !c.parent_id); // top-level only
  const names = ["All", ...mainCategories.map((c) => c.name)];
  containerEl.innerHTML = "";

  names.forEach((cat) => {
    const pill = document.createElement("button");
    pill.className = "sf-category-pill";
    pill.type = "button";
    pill.textContent = cat;
    pill.addEventListener("click", () => {
      containerEl
        .querySelectorAll(".sf-category-pill")
        .forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      onSelect(cat);
    });
    containerEl.appendChild(pill);
  });

  const first = containerEl.querySelector(".sf-category-pill");
  if (first) first.classList.add("active");
}

/* Returns the given category's id plus every id nested underneath it */
function getDescendantCategoryIds(categoryName, categories) {
  const root = categories.find((c) => c.name === categoryName);
  if (!root) return [];

  const ids = [root.id];
  function collect(parentId) {
    categories.forEach((c) => {
      if (c.parent_id === parentId) {
        ids.push(c.id);
        collect(c.id);
      }
    });
  }
  collect(root.id);
  return ids;
}

/* ---------------- Contact Modal ---------------- */

function openContactModal(productName) {
  const modal = document.getElementById("contact-modal");
  const productField = document.getElementById("contact-product");
  if (!modal) return;
  productField.value = productName || "General enquiry";
  modal.classList.add("open");
}

function closeContactModal() {
  const modal = document.getElementById("contact-modal");
  if (modal) modal.classList.remove("open");
}
