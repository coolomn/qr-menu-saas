"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { LogOut, UtensilsCrossed, QrCode, Plus, X, List, Power, PowerOff, Sparkles, Palette, Edit3, Info, ImageIcon, Menu, Image as ImageIcon2, Trash2, FileUp, AlertTriangle, GripVertical, Copy, Eye, EyeOff } from "lucide-react";
import { formatPriceForDisplay } from "@/lib/format-price";
import { prepareProductImageForUpload } from "@/lib/prepare-product-image-client";
import { suggestAllergenIdsFromText } from "@/lib/suggest-allergens";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function AdminInstagramGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8A3.6 3.6 0 0 0 20 16.4V7.6A3.6 3.6 0 0 0 16.4 4H7.6m9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10m0 2a3 3 0 1 0 .001 6.001A3 3 0 0 0 12 9z" />
    </svg>
  );
}

const ALLERGEN_OPTIONS = [
  { id: 'gluten', label: 'Gluten', icon: '🌾' },
  { id: 'dairy', label: 'Süt', icon: '🥛' },
  { id: 'nuts', label: 'Kuruyemiş', icon: '🥜' },
  { id: 'seafood', label: 'Deniz Ürünü', icon: '🦐' },
  { id: 'egg', label: 'Yumurta', icon: '🥚' },
  { id: 'vegan', label: 'Vegan', icon: '🌱' },
  { id: 'spicy', label: 'Acı', icon: '🌶️' }
];

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [activeTab, setActiveTab] = useState("products");
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingSlider, setUploadingSlider] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [settings, setSettings] = useState({ 
    logo_url: "", 
    primary_color: "#2563eb",
    slider_images: [] as string[],
    welcome_bg_url: "",
    instagram: "",
  });
  
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [welcomeBgFile, setWelcomeBgFile] = useState<File | null>(null);
  
  const [tableNumber, setTableNumber] = useState("");
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const [isResetMenuModalOpen, setIsResetMenuModalOpen] = useState(false);
  const [resetMenuPhrase, setResetMenuPhrase] = useState("");
  const [resetMenuBusy, setResetMenuBusy] = useState(false);

  const [categoryDeleteCtx, setCategoryDeleteCtx] = useState<{
    id: string;
    name: string;
    productCount: number;
    moveToId: string;
  } | null>(null);
  const [categoryDeleteBusy, setCategoryDeleteBusy] = useState(false);
  const [categoryDragId, setCategoryDragId] = useState<string | null>(null);
  const [categoryDragOverId, setCategoryDragOverId] = useState<string | null>(null);
  const [categoryReorderBusy, setCategoryReorderBusy] = useState(false);

  const [newCategory, setNewCategory] = useState({
    name: "",
    main_group: "",
    name_en: "",
    name_ru: "",
    main_group_en: "",
    main_group_ru: "",
  });
  
  const [newProduct, setNewProduct] = useState({ 
    name: "", name_en: "", name_ru: "", 
    description: "", description_en: "", description_ru: "", 
    price: "", category_id: "", file: null as File | null, image_url: "",
    allergens: [] as string[]
  });

  const productFileInputRef = useRef<HTMLInputElement>(null);
  const newProductRef = useRef(newProduct);
  const [productImageObjectUrl, setProductImageObjectUrl] = useState<string | null>(null);
  const [allergenSuggestMessage, setAllergenSuggestMessage] = useState<string | null>(null);

  useEffect(() => {
    newProductRef.current = newProduct;
  }, [newProduct]);

  useEffect(() => {
    setAllergenSuggestMessage(null);
  }, [
    newProduct.name,
    newProduct.description,
    newProduct.name_en,
    newProduct.description_en,
    newProduct.name_ru,
    newProduct.description_ru,
  ]);

  useEffect(() => {
    if (!newProduct.file || !isProductModalOpen) {
      setProductImageObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(newProduct.file);
    setProductImageObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [newProduct.file, isProductModalOpen]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/admin/login"); return; }
      setUser(session.user);
      
      const { data: resData } = await supabase.from("restaurants").select("*").eq("owner_id", session.user.id).single();
        
      if (resData) {
        setRestaurant(resData);
        setSettings({ 
            logo_url: resData.logo_url || "", 
            primary_color: resData.primary_color || "#2563eb",
            slider_images: resData.slider_images || [],
            welcome_bg_url: resData.welcome_bg_url || "",
            instagram:
              resData.instagram != null && String(resData.instagram).trim() !== ""
                ? String(resData.instagram).trim()
                : "",
        });
        
        const { data: catData } = await supabase.from("categories").select("*").eq("restaurant_id", resData.id).order('sort_order');
        setCategories(catData || []);
        
        if (catData && catData.length > 0) {
          const categoryIds = catData.map((c: any) => c.id);
          const { data: prodData, error: prodErr } = await supabase
            .from("products")
            .select("*, categories(*)")
            .in("category_id", categoryIds);
          if (prodErr) console.error(prodErr);
          setProducts(prodData || []);
        } else {
          setProducts([]);
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [router]);

  const handleSaveSettings = async () => {
    if (!restaurant) {
      alert("Hata: Restoran bulunamadı!"); return;
    }
    setIsSaving(true);
    try {
      let finalLogoUrl = settings.logo_url;
      let finalWelcomeBgUrl = settings.welcome_bg_url;

      if (logoFile) {
        const fileName = `logo-${Math.random()}.${logoFile.name.split('.').pop()}`;
        const { error } = await supabase.storage.from('menu-images').upload(fileName, logoFile);
        if (!error) finalLogoUrl = supabase.storage.from('menu-images').getPublicUrl(fileName).data.publicUrl;
      }

      if (welcomeBgFile) {
        const fileName = `bg-${Math.random()}.${welcomeBgFile.name.split('.').pop()}`;
        const { error } = await supabase.storage.from('menu-images').upload(fileName, welcomeBgFile);
        if (!error) finalWelcomeBgUrl = supabase.storage.from('menu-images').getPublicUrl(fileName).data.publicUrl;
      }

      const ig = settings.instagram.trim();
      const payload = {
        primary_color: settings.primary_color,
        logo_url: finalLogoUrl,
        slider_images: settings.slider_images,
        welcome_bg_url: finalWelcomeBgUrl,
        instagram: ig || null,
      };

      const { data: updatedRow, error: dbError } = await supabase
        .from("restaurants")
        .update(payload)
        .eq("id", restaurant.id)
        .select("id, instagram, primary_color, logo_url, welcome_bg_url, slider_images")
        .single();

      if (dbError) {
        const hint = [dbError.message, (dbError as { details?: string }).details]
          .filter(Boolean)
          .join(" — ");
        throw new Error(hint || "Veritabanı hatası.");
      }

      const savedIg =
        updatedRow?.instagram != null && String(updatedRow.instagram).trim() !== ""
          ? String(updatedRow.instagram).trim()
          : "";
      if (ig && savedIg !== ig) {
        throw new Error(
          "Instagram kaydedilemedi: veritabanında `restaurants.instagram` sütunu yok veya API tarafından yok sayılıyor. Supabase SQL Editor’de şunu çalıştırın: alter table public.restaurants add column if not exists instagram text;"
        );
      }

      alert("Görünüm ayarları kaydedildi!");
      setSettings({
        ...settings,
        logo_url: finalLogoUrl,
        welcome_bg_url: finalWelcomeBgUrl,
        instagram: savedIg,
      });
      setRestaurant((r: any) =>
        r ? { ...r, ...updatedRow, instagram: savedIg || null } : r
      );
      setLogoFile(null);
      setWelcomeBgFile(null);
    } catch (error: any) {
      alert(error.message || "Hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSliderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Maksimum 2MB!"); return; }
    setUploadingSlider(true);
    const fileName = `slider-${Math.random()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('menu-images').upload(fileName, file);
    if (!error) {
      const url = supabase.storage.from('menu-images').getPublicUrl(fileName).data.publicUrl;
      setSettings(prev => ({ ...prev, slider_images: [...prev.slider_images, url] }));
    }
    setUploadingSlider(false);
  };

  const removeSliderImage = (index: number) => {
    const newSliderImages = [...settings.slider_images];
    newSliderImages.splice(index, 1);
    setSettings({ ...settings, slider_images: newSliderImages });
  };

  const handleToggleActive = async (productId: string, currentStatus: boolean) => {
    await supabase.from("products").update({ is_active: !currentStatus }).eq("id", productId);
    setProducts(products.map((p: any) => p.id === productId ? { ...p, is_active: !currentStatus } : p));
  };

  const handleUpdatePrice = async (productId: string, currentPrice: string) => {
    const newPrice = window.prompt("Yeni fiyatı girin:", currentPrice);
    if (newPrice && newPrice !== currentPrice) {
      await supabase.from("products").update({ price: newPrice }).eq("id", productId);
      setProducts(products.map((p: any) => p.id === productId ? { ...p, price: newPrice } : p));
    }
  };

  const toggleAllergen = (allergenId: string) => {
    setNewProduct((prev: any) => {
      const current = prev.allergens || [];
      return current.includes(allergenId) 
        ? { ...prev, allergens: current.filter((id: string) => id !== allergenId) }
        : { ...prev, allergens: [...current, allergenId] };
    });
  };

  const clearProductImage = () => {
    setNewProduct((prev: any) => ({ ...prev, file: null, image_url: "" }));
    if (productFileInputRef.current) productFileInputRef.current.value = "";
  };

  const handleSuggestAllergens = () => {
    const prev = newProductRef.current;
    const ids = suggestAllergenIdsFromText([
      prev.name,
      prev.description,
      prev.name_en,
      prev.description_en,
      prev.name_ru,
      prev.description_ru,
    ]);
    if (ids.length === 0) {
      setAllergenSuggestMessage("Metinde eşleşen alerjen anahtar kelimesi bulunamadı. Elle seçebilirsiniz.");
      return;
    }
    const already = new Set(prev.allergens || []);
    const newIds = ids.filter((id: string) => !already.has(id));
    if (newIds.length === 0) {
      setAllergenSuggestMessage("Önerilenler zaten işaretli; yeni bir eşleşme yok.");
      return;
    }
    setNewProduct({
      ...prev,
      allergens: [...new Set([...(prev.allergens || []), ...ids])],
    });
    const labels = newIds.map((id: string) => ALLERGEN_OPTIONS.find((a) => a.id === id)?.label || id);
    setAllergenSuggestMessage(`Eklendi: ${labels.join(", ")}`);
  };

  const openEditModal = (product: any) => {
    setAllergenSuggestMessage(null);
    setEditingProductId(product.id);
    setNewProduct({
      name: product.name || "", name_en: product.name_en || "", name_ru: product.name_ru || "",
      description: product.description || "", description_en: product.description_en || "", description_ru: product.description_ru || "",
      price: product.price || "", category_id: product.category_id || "", file: null, image_url: product.image_url || "",
      allergens: product.allergens || []
    });
    setIsProductModalOpen(true);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant?.id) {
      alert("Restoran bulunamadı.");
      return;
    }
    const selectedCategory = categories.find((c: any) => c.id === newProduct.category_id);
    if (!selectedCategory) {
      alert("Geçerli bir kategori seçin.");
      return;
    }
    setUploading(true);
    let imageUrl = newProduct.image_url;
    try {
      if (newProduct.file) {
        const prep = await prepareProductImageForUpload(newProduct.file);
        const ext =
          prep.blob === newProduct.file && newProduct.file.name.includes(".")
            ? (newProduct.file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"
            : "jpg";
        const fileName = `${Math.random()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("menu-images").upload(fileName, prep.blob, {
          contentType: prep.contentType,
        });
        if (uploadError) {
          alert(uploadError.message || "Görsel yüklenemedi.");
          return;
        }
        imageUrl = supabase.storage.from("menu-images").getPublicUrl(fileName).data.publicUrl;
      }

      const payload = {
        restaurant_id: restaurant.id,
        category_id: newProduct.category_id, name: newProduct.name, name_en: newProduct.name_en, name_ru: newProduct.name_ru,
        description: newProduct.description, description_en: newProduct.description_en, description_ru: newProduct.description_ru,
        price: newProduct.price, image_url: imageUrl, allergens: newProduct.allergens
      };

      if (editingProductId) {
        const { data, error } = await supabase.from("products").update(payload).eq("id", editingProductId).select("*, categories(*)").single();
        if (!error) setProducts(products.map((p: any) => p.id === editingProductId ? data : p));
        else {
          alert(error.message || "Kayıt başarısız.");
          return;
        }
      } else {
        const { data, error } = await supabase.from("products").insert([{ ...payload, is_active: true }]).select("*, categories(*)").single();
        if (!error) setProducts([...products, data]);
        else {
          alert(error.message || "Kayıt başarısız.");
          return;
        }
      }
      setIsProductModalOpen(false);
      setEditingProductId(null);
      setAllergenSuggestMessage(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Görsel işlenemedi.");
    } finally {
      setUploading(false);
    }
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant?.id) return;

    const mainGroup = (newCategory.main_group || "DİĞER").toLocaleUpperCase("tr-TR");

    const withI18n = {
      name: newCategory.name,
      main_group: mainGroup,
      name_en: newCategory.name_en.trim() || null,
      name_ru: newCategory.name_ru.trim() || null,
      main_group_en: newCategory.main_group_en.trim() || null,
      main_group_ru: newCategory.main_group_ru.trim() || null,
    };

    const base = {
      name: newCategory.name,
      main_group: mainGroup,
    };

    const schemaMismatch = (err: { message?: string; code?: string } | null) =>
      err &&
      (/column|schema cache|does not exist|42703/i.test(err.message || "") || err.code === "42703");

    if (editingCategoryId) {
      let { data, error } = await supabase.from("categories").update(withI18n).eq("id", editingCategoryId).select().single();
      if (error && schemaMismatch(error)) {
        ({ data, error } = await supabase.from("categories").update(base).eq("id", editingCategoryId).select().single());
        if (!error && data) {
          alert(
            "Kategori güncellendi (Türkçe alanlar). EN/RU ve ana grup çevirileri için Supabase’te migration SQL’lerini çalıştırın: supabase/migrations/"
          );
        }
      }
      if (!error && data) {
        setCategories(categories.map((c: any) => (c.id === editingCategoryId ? data : c)));
        setProducts(products.map((p: any) => (p.category_id === editingCategoryId ? { ...p, categories: data } : p)));
        setNewCategory({ name: "", main_group: "", name_en: "", name_ru: "", main_group_en: "", main_group_ru: "" });
        setEditingCategoryId(null);
        setIsCategoryModalOpen(false);
      } else if (error) {
        alert(error.message || "Kategori güncellenemedi.");
      }
      return;
    }

    const insertBase = {
      restaurant_id: restaurant.id,
      ...base,
      sort_order: categories.length,
    };
    const insertWithI18n = {
      ...insertBase,
      name_en: withI18n.name_en,
      name_ru: withI18n.name_ru,
      main_group_en: withI18n.main_group_en,
      main_group_ru: withI18n.main_group_ru,
      is_active: true,
    };
    let { data, error } = await supabase.from("categories").insert([insertWithI18n]).select().single();
    if (error && schemaMismatch(error)) {
      ({ data, error } = await supabase.from("categories").insert([insertBase]).select().single());
      if (!error && data) {
        alert(
          "Kategori eklendi (Türkçe alanlar). EN/RU ve ana grup çevirileri için Supabase’te migration SQL’lerini çalıştırın: supabase/migrations/"
        );
      }
    }
    if (!error && data) {
      setCategories([...categories, data]);
      setNewCategory({ name: "", main_group: "", name_en: "", name_ru: "", main_group_en: "", main_group_ru: "" });
      setEditingCategoryId(null);
      setIsCategoryModalOpen(false);
    } else if (error) {
      alert(error.message || "Kategori eklenemedi.");
    }
  };

  const openEditCategoryModal = (c: any) => {
    setEditingCategoryId(c.id);
    setNewCategory({
      name: c.name || "",
      main_group: String(c.main_group || "").toLocaleUpperCase("tr-TR"),
      name_en: c.name_en != null ? String(c.name_en) : "",
      name_ru: c.name_ru != null ? String(c.name_ru) : "",
      main_group_en: c.main_group_en != null ? String(c.main_group_en) : "",
      main_group_ru: c.main_group_ru != null ? String(c.main_group_ru) : "",
    });
    setIsCategoryModalOpen(true);
  };

  const closeCategoryModal = () => {
    setIsCategoryModalOpen(false);
    setEditingCategoryId(null);
    setNewCategory({ name: "", main_group: "", name_en: "", name_ru: "", main_group_en: "", main_group_ru: "" });
  };

  const openDuplicateCategoryModal = (c: any) => {
    setEditingCategoryId(null);
    setNewCategory({
      name: `${c.name || "Kategori"} (kopya)`,
      main_group: String(c.main_group || "").toLocaleUpperCase("tr-TR"),
      name_en: c.name_en != null ? String(c.name_en) : "",
      name_ru: c.name_ru != null ? String(c.name_ru) : "",
      main_group_en: c.main_group_en != null ? String(c.main_group_en) : "",
      main_group_ru: c.main_group_ru != null ? String(c.main_group_ru) : "",
    });
    setIsCategoryModalOpen(true);
  };

  const persistCategoryOrder = async (ordered: any[]) => {
    setCategoryReorderBusy(true);
    try {
      const results = await Promise.all(
        ordered.map((cat, index) =>
          supabase.from("categories").update({ sort_order: index }).eq("id", cat.id).select("id").single()
        )
      );
      const firstErr = results.find((r) => r.error);
      if (firstErr?.error) {
        alert(firstErr.error.message || "Sıra kaydedilemedi.");
        return;
      }
      setCategories(ordered.map((c, i) => ({ ...c, sort_order: i })));
    } finally {
      setCategoryReorderBusy(false);
    }
  };

  const handleCategoryDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/category-id", id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setCategoryDragId(id);
  };

  const handleCategoryDragEnd = () => {
    setCategoryDragId(null);
    setCategoryDragOverId(null);
  };

  const handleCategoryDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/category-id") || e.dataTransfer.getData("text/plain");
    setCategoryDragOverId(null);
    setCategoryDragId(null);
    if (!sourceId || sourceId === targetId) return;
    const list = [...categories];
    const si = list.findIndex((c: any) => c.id === sourceId);
    const ti = list.findIndex((c: any) => c.id === targetId);
    if (si < 0 || ti < 0) return;
    const [removed] = list.splice(si, 1);
    list.splice(ti, 0, removed);
    setCategories(list);
    await persistCategoryOrder(list);
  };

  const openDeleteCategoryModal = (c: any) => {
    const productCount = products.filter((p: any) => p.category_id === c.id).length;
    const others = categories.filter((x: any) => x.id !== c.id);
    setCategoryDeleteCtx({
      id: c.id,
      name: c.name || "Kategori",
      productCount,
      moveToId: others[0]?.id ?? "",
    });
  };

  const closeCategoryDeleteModal = () => {
    setCategoryDeleteCtx(null);
  };

  const handleConfirmCategoryDelete = async () => {
    if (!categoryDeleteCtx) return;
    const { id, productCount, moveToId } = categoryDeleteCtx;
    setCategoryDeleteBusy(true);
    try {
      if (productCount === 0) {
        const { error } = await supabase.from("categories").delete().eq("id", id);
        if (error) {
          alert(error.message || "Kategori silinemedi.");
          return;
        }
        setCategories(categories.filter((c: any) => c.id !== id));
        setProducts(products.filter((p: any) => p.category_id !== id));
        closeCategoryDeleteModal();
        return;
      }
      const others = categories.filter((x: any) => x.id !== id);
      if (others.length === 0) return;
      if (!moveToId) {
        alert("Taşıma için hedef kategori seçin.");
        return;
      }
      const targetCat = others.find((x: any) => x.id === moveToId);
      const { error: uErr } = await supabase.from("products").update({ category_id: moveToId }).eq("category_id", id);
      if (uErr) {
        alert(uErr.message || "Ürünler taşınamadı.");
        return;
      }
      const { error: dErr } = await supabase.from("categories").delete().eq("id", id);
      if (dErr) {
        alert(dErr.message || "Kategori silinemedi.");
        return;
      }
      setCategories(categories.filter((c: any) => c.id !== id));
      setProducts(
        products.map((p: any) =>
          p.category_id === id ? { ...p, category_id: moveToId, categories: targetCat || p.categories } : p
        )
      );
      closeCategoryDeleteModal();
    } finally {
      setCategoryDeleteBusy(false);
    }
  };

  const handleToggleCategoryMenuVisible = async (c: any) => {
    const visible = c.is_active !== false;
    const next = !visible;
    const { data, error } = await supabase.from("categories").update({ is_active: next }).eq("id", c.id).select().single();
    if (error) {
      if (/42703|does not exist|column|schema cache/i.test(error.message || "") || (error as { code?: string }).code === "42703") {
        alert(
          "Menüde gizle özelliği için Supabase’te migration çalıştırın: supabase/migrations/20260514100000_categories_is_active.sql"
        );
      } else {
        alert(error.message || "Güncellenemedi.");
      }
      return;
    }
    if (data) setCategories(categories.map((x: any) => (x.id === c.id ? data : x)));
  };

  const translateLine = async (q: string, lang: "en" | "ru") => {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=tr|${lang}`
    );
    const data = await res.json();
    return data.responseData?.translatedText as string | undefined;
  };

  const handleAutoTranslateCategoryMainGroup = async () => {
    const q = newCategory.main_group.trim();
    if (!q) return;
    setTranslating(true);
    try {
      const updated = { ...newCategory };
      const en = await translateLine(q, "en");
      const ru = await translateLine(q, "ru");
      if (en) updated.main_group_en = en;
      if (ru) updated.main_group_ru = ru;
      setNewCategory(updated);
    } finally {
      setTranslating(false);
    }
  };

  const handleAutoTranslateCategory = async () => {
    if (!newCategory.name.trim()) return;
    setTranslating(true);
    try {
      const updated = { ...newCategory };
      for (const target of [{ t: "en" as const, f: "name_en" as const }, { t: "ru" as const, f: "name_ru" as const }]) {
        const res = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(newCategory.name)}&langpair=tr|${target.t}`
        );
        const data = await res.json();
        if (data.responseData?.translatedText) updated[target.f] = data.responseData.translatedText;
      }
      setNewCategory(updated);
    } finally {
      setTranslating(false);
    }
  };

  const MENU_RESET_PHRASE = "MENÜYÜ SİL";

  const handleConfirmResetMenu = async () => {
    if (!restaurant?.id || resetMenuPhrase !== MENU_RESET_PHRASE) return;
    setResetMenuBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert("Oturum bulunamadı.");
        return;
      }
      const res = await fetch("/api/menu/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ restaurantId: restaurant.id }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error || "Menü silinemedi.");
        return;
      }
      setCategories([]);
      setProducts([]);
      setIsResetMenuModalOpen(false);
      setResetMenuPhrase("");
      setActiveTab("categories");
    } catch {
      alert("Bağlantı hatası.");
    } finally {
      setResetMenuBusy(false);
    }
  };

  const handleAutoTranslate = async () => {
    if (!newProduct.name) return;
    setTranslating(true);
    try {
      const targets = [{t:'en', n:'name_en', d:'description_en'}, {t:'ru', n:'name_ru', d:'description_ru'}];
      const updated: any = { ...newProduct };
      for (const target of targets) {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(newProduct.name)}&langpair=tr|${target.t}`);
        const data = await res.json();
        if (data.responseData) updated[target.n] = data.responseData.translatedText;
        if (newProduct.description) {
          const resD = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(newProduct.description)}&langpair=tr|${target.t}`);
          const dataD = await resD.json();
          if (dataD.responseData) updated[target.d] = dataD.responseData.translatedText;
        }
      }
      setNewProduct(updated);
    } finally { setTranslating(false); }
  };

  const downloadQRCode = () => { window.open(`https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(`https://tapmenu.com.tr/menu/${restaurant.slug}${tableNumber ? `?masa=${tableNumber}` : ""}`)}`, '_blank'); };

  if (loading) return <div className="h-screen flex items-center justify-center font-bold text-gray-400 italic">TapMenu Hazırlanıyor...</div>;

  const productPreviewSrc = newProduct.file ? productImageObjectUrl : newProduct.image_url || null;
  const showProductImagePanel = Boolean(newProduct.file || newProduct.image_url);

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden font-sans">
      {isMobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r flex flex-col shadow-xl transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8 border-b flex items-center justify-between"><div className="flex items-center gap-3 font-bold text-2xl text-blue-600"><QrCode /> TapMenu</div><button className="md:hidden text-gray-400" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button></div>
        <nav className="flex-1 p-6 space-y-2 overflow-y-auto">
          <button onClick={() => {setActiveTab("products"); setIsMobileMenuOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${activeTab === 'products' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}><UtensilsCrossed size={20} /> Ürünler</button>
          <button onClick={() => {setActiveTab("categories"); setIsMobileMenuOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${activeTab === 'categories' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}><List size={20} /> Kategoriler</button>
          <button onClick={() => {setActiveTab("qr"); setIsMobileMenuOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${activeTab === 'qr' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}><QrCode size={20} /> QR Kod Üretici</button>
          <Link
            href="/admin/import"
            onClick={() => setIsMobileMenuOpen(false)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all text-gray-500 hover:bg-gray-50"
          >
            <FileUp size={20} /> Menü içe aktar
          </Link>
          <button onClick={() => {setActiveTab("settings"); setIsMobileMenuOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}><Palette size={20} /> Görünüm Ayarları</button>
        </nav>
        <div className="p-6 border-t"><button onClick={() => supabase.auth.signOut().then(() => router.push("/admin/login"))} className="w-full flex items-center gap-3 px-4 py-3 text-red-500 font-bold hover:bg-red-50 rounded-xl transition-all"><LogOut size={20} /> Çıkış Yap</button></div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden w-full">
        <header className="md:hidden bg-white p-4 border-b flex justify-between items-center shadow-sm z-20"><div className="font-bold text-xl text-blue-600 flex items-center gap-2"><QrCode size={24} /> TapMenu</div><button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-gray-900 bg-gray-50 rounded-xl"><Menu size={24} /></button></header>
        <main className="flex-1 overflow-y-auto p-4 md:p-12 w-full">
          <div className="max-w-5xl mx-auto">
            <header className="mb-6 md:mb-12"><h1 className="text-2xl md:text-4xl font-black text-gray-900 tracking-tight">{restaurant?.name}</h1><p className="text-gray-400 mt-1 md:mt-2 font-medium text-sm md:text-base">Panel Yönetimi</p></header>

            {activeTab === "products" && (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 md:p-8 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/50">
                  <h2 className="text-lg md:text-xl font-black">Ürün Yönetimi</h2>
                  <button onClick={() => { setEditingProductId(null); setAllergenSuggestMessage(null); setNewProduct({name:"", name_en:"", name_ru:"", description:"", description_en:"", description_ru:"", price:"", category_id:"", file:null, image_url:"", allergens: []}); setIsProductModalOpen(true); }} className="w-full md:w-auto justify-center bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all"><Plus size={20} /> Yeni Ürün</button>
                </div>
                <div className="p-3 md:p-4 grid gap-3">
                  {products.map((p: any) => (
                    <div key={p.id} className={`p-4 md:p-5 border border-gray-100 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-blue-200 transition-all bg-white ${!p.is_active ? 'opacity-50 grayscale' : ''}`}>
                      <div className="flex items-start md:items-center gap-4 w-full md:w-auto flex-1 text-gray-900">
                        <div className="w-16 h-16 bg-gray-100 rounded-xl overflow-hidden border flex-shrink-0">{p.image_url ? <img src={p.image_url} alt="Ürün" className="w-full h-full object-cover" /> : <UtensilsCrossed className="m-auto text-gray-300 h-full w-8" />}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1"><div className="font-black text-base md:text-lg leading-tight">{p.name}</div></div>
                          {p.description && <p className="text-xs text-gray-500 font-medium italic line-clamp-2">{p.description}</p>}
                          <div className="flex items-center gap-2 mt-2">
                             <span className="text-[10px] font-black bg-gray-900 text-white px-2 py-0.5 rounded-md uppercase tracking-wider inline-block">{p.categories?.main_group || 'YİYECEKLER'}</span>
                             <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md uppercase tracking-wider inline-block">{p.categories?.name}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-2 md:gap-4 w-full md:w-auto pt-3 md:pt-0 border-t md:border-0 border-gray-100 mt-2 md:mt-0">
                        <div className="flex gap-2"><button onClick={() => openEditModal(p)} className="p-2 md:p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="Düzenle"><Edit3 size={18} /></button><button onClick={() => handleToggleActive(p.id, p.is_active)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] md:text-xs font-black transition-all ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{p.is_active ? <Power size={12} /> : <PowerOff size={12} />} {p.is_active ? 'SATIŞTA' : 'TÜKENDİ'}</button></div>
                        <div className="text-right min-w-[70px]"><div className="text-lg md:text-xl font-black text-blue-600 leading-none">{formatPriceForDisplay(p.price)}</div><button onClick={() => handleUpdatePrice(p.id, p.price)} className="text-[10px] font-bold text-gray-400 hover:text-blue-600 uppercase mt-1">Fiyatı Değiştir</button></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "categories" && (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 md:p-8">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-2">
                  <h2 className="text-lg md:text-xl font-black text-gray-900 uppercase">Kategoriler</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategoryId(null);
                      setNewCategory({ name: "", main_group: "", name_en: "", name_ru: "", main_group_en: "", main_group_ru: "" });
                      setIsCategoryModalOpen(true);
                    }}
                    className="w-full md:w-auto justify-center bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-1 hover:bg-blue-700 shadow-lg transition-all"
                  >
                    <Plus size={18} /> Yeni Kategori
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 font-medium mb-4 leading-relaxed">
                  Sırayı sol tutacak simgeden sürükleyip başka bir kartın üzerine bırakın. Müşteri menüsündeki kategori şeridi bu sırayı kullanır.
                </p>
                {categoryReorderBusy && (
                  <p className="text-xs font-bold text-blue-600 mb-3" role="status">
                    Sıra kaydediliyor…
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {categories.map((c: any) => {
                    const productCount = products.filter((p: any) => p.category_id === c.id).length;
                    const menuHidden = c.is_active === false;
                    return (
                      <div
                        key={c.id}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setCategoryDragOverId(c.id);
                        }}
                        onDrop={(e) => void handleCategoryDrop(e, c.id)}
                        className={`p-3 md:p-4 bg-gray-50 rounded-2xl border font-bold text-gray-700 flex items-stretch gap-2 group transition-all ${
                          categoryDragOverId === c.id && categoryDragId && categoryDragId !== c.id
                            ? "ring-2 ring-blue-400 border-blue-200 bg-blue-50/40"
                            : "border-gray-100"
                        } ${menuHidden ? "opacity-75" : ""}`}
                      >
                        <button
                          type="button"
                          draggable
                          onDragStart={(e) => handleCategoryDragStart(e, c.id)}
                          onDragEnd={handleCategoryDragEnd}
                          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-200/80 shrink-0 self-center touch-none"
                          title="Sürükleyerek sırala"
                          aria-label="Sürükleyerek sırala"
                        >
                          <GripVertical size={20} aria-hidden />
                        </button>
                        <div className="flex flex-col text-left min-w-0 flex-1 justify-center py-0.5">
                          <span className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">{c.main_group || "YİYECEKLER"}</span>
                          <span className="truncate font-black text-gray-800">{c.name}</span>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className="text-[9px] font-bold bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-md">{productCount} ürün</span>
                            {menuHidden && (
                              <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md uppercase tracking-wide">Menüde gizli</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap justify-end content-center gap-1 shrink-0 max-w-[9rem] sm:max-w-none">
                          <button
                            type="button"
                            onClick={() => void handleToggleCategoryMenuVisible(c)}
                            title={menuHidden ? "Menüde göster" : "Menüde gizle"}
                            className={`p-2 rounded-xl transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 ${
                              menuHidden
                                ? "text-amber-700 bg-amber-100 hover:bg-amber-200"
                                : "text-gray-500 bg-white border border-gray-200 hover:bg-gray-100"
                            }`}
                          >
                            {menuHidden ? <Eye size={17} aria-hidden /> : <EyeOff size={17} aria-hidden />}
                          </button>
                          <button
                            type="button"
                            onClick={() => openDuplicateCategoryModal(c)}
                            title="Kopyadan oluştur"
                            className="text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 p-2 rounded-xl transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          >
                            <Copy size={17} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditCategoryModal(c)}
                            title="Düzenle"
                            className="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-2 rounded-xl transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          >
                            <Edit3 size={17} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteCategoryModal(c)}
                            title="Kategoriyi sil"
                            className="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-xl transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          >
                            <Trash2 size={17} aria-hidden />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "qr" && (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-12 max-w-md mx-auto text-center"><div className="w-16 h-16 md:w-20 md:h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 md:mb-8 shadow-inner"><QrCode size={32} /></div><h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-2 tracking-tighter">QR Üretici</h2><input type="text" placeholder="Masa No (Örn: 5)" className="w-full border-2 border-gray-100 p-4 md:p-5 rounded-2xl mb-4 md:mb-6 text-center text-xl md:text-2xl font-black text-gray-900 focus:border-blue-500 outline-none transition-all" value={tableNumber} onChange={e => setTableNumber(e.target.value)} /><button onClick={downloadQRCode} className="w-full bg-gray-900 text-white py-4 md:py-5 rounded-2xl font-black shadow-xl hover:bg-black transition-all">QR Kodu Aç / İndir</button></div>
            )}

            {activeTab === "settings" && (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 md:p-10 max-w-2xl mx-auto">
                <h2 className="text-xl md:text-2xl font-black mb-6 md:mb-8 text-gray-900">Marka Kimliği</h2>
                <div className="space-y-6 md:space-y-8">
                  <div>
                    <label className="block text-[10px] md:text-xs font-black text-gray-400 mb-2 md:mb-3 uppercase tracking-widest">Restoran Logosu</label>
                    {settings.logo_url && !logoFile && (<div className="mb-4 bg-gray-50 p-4 rounded-2xl inline-block border-2 border-gray-100 w-full text-center md:text-left"><img src={settings.logo_url} alt="Logo" className="h-12 md:h-16 object-contain mx-auto md:mx-0" /></div>)}
                    <input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files ? e.target.files[0] : null)} className="w-full text-[10px] md:text-xs font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 outline-none" />
                  </div>

                  <div className="p-4 md:p-6 border-2 border-green-100 rounded-3xl bg-green-50/30">
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon2 size={18} className="text-green-600" />
                      <label className="text-xs md:text-sm font-black text-green-900 uppercase">Açılış (Karşılama) Görseli</label>
                    </div>
                    <p className="text-[10px] md:text-xs font-bold text-gray-500 mb-4">Müşteri QR okuttuğunda çıkan tam ekran dikey arka plan (Örn: Mekan fotoğrafı).</p>
                    {settings.welcome_bg_url && !welcomeBgFile && (<div className="mb-4 w-24 h-32 rounded-xl overflow-hidden border-2 border-green-200"><img src={settings.welcome_bg_url} alt="Karşılama" className="w-full h-full object-cover" /></div>)}
                    <input type="file" accept="image/*" onChange={e => setWelcomeBgFile(e.target.files ? e.target.files[0] : null)} className="w-full text-[10px] md:text-xs font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-green-100 file:text-green-800 hover:file:bg-green-200 outline-none" />
                  </div>

                  <div className="p-4 md:p-6 border-2 border-pink-100 rounded-3xl bg-pink-50/40">
                    <div className="flex items-center gap-2 mb-2">
                      <AdminInstagramGlyph className="h-[18px] w-[18px] text-pink-600" />
                      <label className="text-xs md:text-sm font-black text-gray-900 uppercase">Instagram</label>
                    </div>
                    <p className="text-[10px] md:text-xs font-bold text-gray-500 mb-3">Karşılama ekranında görünür. Kullanıcı adı (ör. mekanadi) veya tam profil linki.</p>
                    <input
                      type="text"
                      placeholder="@mekanadi veya instagram.com/…"
                      className="w-full border-2 border-pink-100 bg-white p-3 md:p-4 rounded-2xl font-bold text-gray-900 outline-none text-sm focus:border-pink-300"
                      value={settings.instagram}
                      onChange={(e) => setSettings({ ...settings, instagram: e.target.value })}
                    />
                  </div>

                  <div className="p-4 md:p-6 border-2 border-gray-100 rounded-3xl bg-gray-50/50">
                    <div className="flex items-center gap-2 mb-2"><ImageIcon size={18} className="text-blue-500" /><label className="text-xs md:text-sm font-black text-gray-900 uppercase">Menü İçi Vitrin Görselleri</label></div>
                    <p className="text-[10px] md:text-xs font-bold text-gray-400 mb-4">En fazla 3 adet, yatay (16:9).</p>
                    {settings.slider_images.length > 0 && (<div className="flex gap-3 mb-4 overflow-x-auto pb-2 no-scrollbar">{settings.slider_images.map((img: string, idx: number) => (<div key={idx} className="relative w-24 h-16 md:w-32 md:h-20 bg-gray-200 rounded-xl overflow-hidden flex-shrink-0 shadow-sm border border-gray-200"><img src={img} alt="Slider" className="w-full h-full object-cover" /><button onClick={() => removeSliderImage(idx)} className="absolute top-1 right-1 bg-red-500 text-white p-1 md:p-1.5 rounded-lg hover:bg-red-600 shadow-md"><X size={12} strokeWidth={4} /></button></div>))}</div>)}
                    {settings.slider_images.length < 3 && (<div className="relative mt-2"><input type="file" accept="image/*" onChange={handleSliderUpload} disabled={uploadingSlider} className="w-full text-[10px] md:text-xs font-bold text-gray-500 file:mr-2 md:file:mr-4 file:py-2 md:file:py-3 file:px-4 md:file:px-6 file:rounded-xl file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer disabled:opacity-50" />{uploadingSlider && <div className="absolute top-3 right-4 text-xs font-black text-blue-600 animate-pulse">Yükleniyor...</div>}</div>)}
                  </div>
                  <div><label className="block text-[10px] md:text-xs font-black text-gray-400 mb-2 md:mb-3 uppercase tracking-widest">Marka Rengi</label><div className="flex gap-3 md:gap-4 p-3 md:p-4 bg-gray-50 rounded-2xl border-2 border-gray-50"><input type="color" className="w-12 h-12 md:w-16 md:h-16 rounded-xl cursor-pointer border-0 p-0 bg-transparent" value={settings.primary_color} onChange={e => setSettings({...settings, primary_color: e.target.value})} /><input type="text" className="flex-1 bg-transparent font-mono font-black text-lg md:text-xl text-gray-900 outline-none w-full" value={settings.primary_color} onChange={e => setSettings({...settings, primary_color: e.target.value})} /></div></div>

                  <div className="p-4 md:p-6 border-2 border-red-200 rounded-3xl bg-red-50/50 space-y-3">
                    <div className="flex items-center gap-2 text-red-800">
                      <AlertTriangle size={20} className="shrink-0" />
                      <span className="text-sm md:text-base font-black uppercase tracking-tight">Tehlikeli işlem</span>
                    </div>
                    <p className="text-xs md:text-sm text-red-900/90 font-medium leading-relaxed">
                      <strong>Menüyü tamamen sil</strong> düğmesi bu restorandaki <strong>tüm kategorileri ve tüm ürünleri</strong> kalıcı olarak kaldırır. Logo, renk, karşılama görseli ve hesabınız silinmez. Bu işlemin <strong>geri al tuşu yoktur</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setResetMenuPhrase("");
                        setIsResetMenuModalOpen(true);
                      }}
                      className="w-full py-3 rounded-2xl font-black text-sm border-2 border-red-300 bg-white text-red-700 hover:bg-red-100 transition-colors"
                    >
                      Menüyü tamamen sil…
                    </button>
                  </div>

                  <button onClick={handleSaveSettings} disabled={isSaving} className="w-full bg-blue-600 text-white py-4 md:py-5 rounded-2xl font-black shadow-xl hover:bg-blue-700 transition-all">{isSaving ? "KAYDEDİLİYOR..." : "AYARLARI KAYDET"}</button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {isResetMenuModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-red-100 overflow-hidden">
            <div className="p-6 border-b border-red-100 bg-red-50/80 flex justify-between items-start gap-3">
              <div>
                <h3 className="font-black text-lg text-red-900">Menüyü tamamen sil</h3>
                <p className="text-xs text-red-800/90 mt-1 font-medium leading-relaxed">
                  Tüm ürünler ve kategoriler silinecek. Emin misiniz?
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsResetMenuModalOpen(false);
                  setResetMenuPhrase("");
                }}
                className="text-gray-400 hover:text-gray-800 p-2 rounded-full bg-white/80"
                aria-label="Kapat"
              >
                <X size={22} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 font-medium">
                Devam etmek için aşağıdaki kutuya tam olarak şunu yazın:{" "}
                <span className="font-mono font-black text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{MENU_RESET_PHRASE}</span>
              </p>
              <input
                type="text"
                autoComplete="off"
                placeholder={MENU_RESET_PHRASE}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-mono text-sm outline-none focus:border-red-400"
                value={resetMenuPhrase}
                onChange={(e) => setResetMenuPhrase(e.target.value)}
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMenuModalOpen(false);
                    setResetMenuPhrase("");
                  }}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-500 border-2 border-gray-100 hover:bg-gray-50"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={resetMenuPhrase !== MENU_RESET_PHRASE || resetMenuBusy}
                  onClick={handleConfirmResetMenu}
                  className="flex-1 py-3 rounded-xl font-black bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:pointer-events-none"
                >
                  {resetMenuBusy ? "Siliniyor…" : "Evet, sil"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh] md:max-h-[90vh]">
                <div className="p-4 md:p-8 border-b flex justify-between items-center"><h3 className="font-black text-xl md:text-2xl text-gray-900 tracking-tighter">{editingProductId ? "Ürünü Düzenle" : "Yeni Ürün Ekle"}</h3><button type="button" onClick={() => { setIsProductModalOpen(false); setEditingProductId(null); setAllergenSuggestMessage(null); }} className="text-gray-300 hover:text-gray-900 bg-gray-100 p-1 md:p-2 rounded-full"><X size={24} /></button></div>
                
                {/* GÜNCELLENEN FORM BURASI: İNGİLİZCE VE RUSÇA KUTULARI EKLENDİ */}
                <form onSubmit={handleProductSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6 overflow-y-auto text-gray-900 pb-20 md:pb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <select required className="w-full border-2 border-gray-50 bg-gray-50 p-3 md:p-4 rounded-2xl font-bold outline-none focus:border-blue-500 text-gray-900 text-sm md:text-base" value={newProduct.category_id} onChange={e => setNewProduct({...newProduct, category_id: e.target.value})}>
                            <option value="">Kategori Seç</option>
                            {categories.map((cat: any) => <option key={cat.id} value={cat.id}>{cat.name} ({cat.main_group || 'YİYECEKLER'})</option>)}
                        </select>
                        <input required type="text" placeholder="Fiyat (Örn: 250 ₺)" className="w-full border-2 border-gray-50 bg-gray-50 p-3 md:p-4 rounded-2xl font-black outline-none focus:border-blue-500 text-gray-900 text-sm md:text-base" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} />
                    </div>

                    <div className="p-4 md:p-6 bg-blue-50 rounded-2xl md:rounded-[2rem] border border-blue-100 space-y-3 md:space-y-4">
                        {/* ÇEVİR BUTONU BURAYA GERİ GELDİ */}
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">🇹🇷 Türkçe Bilgiler</span>
                            <button type="button" onClick={handleAutoTranslate} disabled={translating} className="text-[9px] md:text-[10px] font-black bg-white text-blue-600 px-3 md:px-4 py-1.5 md:py-2 rounded-full shadow-sm flex items-center gap-1 md:gap-2">
                                <Sparkles size={12}/> {translating ? "..." : "ÇEVİR"}
                            </button>
                        </div>
                        <input required placeholder="Ürün Adı" className="w-full bg-white p-3 md:p-4 rounded-xl font-black text-gray-900 outline-none shadow-sm text-sm md:text-base" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
                        <textarea placeholder="Açıklama..." className="w-full bg-white p-3 md:p-4 rounded-xl font-medium text-gray-600 text-xs md:text-sm outline-none shadow-sm" rows={2} value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} />
                    </div>

                    {/* İNGİLİZCE VE RUSÇA KUTULARI BURAYA GERİ GELDİ */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-2">🇬🇧 English</label>
                            <input placeholder="Name" className="w-full border-2 border-gray-50 p-3 rounded-xl text-xs md:text-sm font-bold text-gray-900 outline-none" value={newProduct.name_en} onChange={e => setNewProduct({...newProduct, name_en: e.target.value})} />
                            <textarea placeholder="Description" className="w-full border-2 border-gray-50 p-3 rounded-xl text-xs font-medium text-gray-900 outline-none" rows={2} value={newProduct.description_en} onChange={e => setNewProduct({...newProduct, description_en: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-2">🇷🇺 Russian</label>
                            <input placeholder="Название" className="w-full border-2 border-gray-50 p-3 rounded-xl text-xs md:text-sm font-bold text-gray-900 outline-none" value={newProduct.name_ru} onChange={e => setNewProduct({...newProduct, name_ru: e.target.value})} />
                            <textarea placeholder="Описание" className="w-full border-2 border-gray-50 p-3 rounded-xl text-xs font-medium text-gray-900 outline-none" rows={2} value={newProduct.description_ru} onChange={e => setNewProduct({...newProduct, description_ru: e.target.value})} />
                        </div>
                    </div>

                    <div className="p-4 md:p-5 border-2 border-gray-50 rounded-2xl space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Alerjenler</span>
                        <button
                          type="button"
                          onClick={handleSuggestAllergens}
                          className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase text-blue-700 hover:bg-blue-100"
                        >
                          <Sparkles size={14} aria-hidden />
                          Alerjen öner
                        </button>
                      </div>
                      <p className="text-[9px] font-medium text-gray-500 leading-snug">
                        Otomatik öneridir; menü ve sorumluluğu kontrol edin. Mevcut seçimlerinize eklenir (üzerine yazılmaz).
                        <span className="block mt-1 text-gray-400">
                          Taranır: Türkçe ürün adı ve açıklama, İngilizce ve Rusça ad / açıklama alanları.
                        </span>
                      </p>
                      {allergenSuggestMessage && (
                        <p className="text-[10px] font-bold text-blue-800 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 leading-snug" role="status">
                          {allergenSuggestMessage}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 md:gap-2">
                        {ALLERGEN_OPTIONS.map((alg: any) => (
                          <button
                            key={alg.id}
                            type="button"
                            onClick={() => toggleAllergen(alg.id)}
                            className={`px-2 md:px-3 py-1.5 md:py-2 rounded-xl text-[10px] md:text-xs font-bold flex items-center gap-1 md:gap-1.5 transition-all ${newProduct.allergens?.includes(alg.id) ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                          >
                            <span>{alg.icon}</span> {alg.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase ml-2">Ürün Görseli</label>
                      <p className="text-[10px] text-gray-500 font-medium leading-snug">
                        En fazla 5 MB. Uzun kenar 2048 px üzerindeyse otomatik küçültülür. Çok büyük kaynak dosya (25 MB üstü) kabul edilmez.
                      </p>
                      {showProductImagePanel ? (
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3 rounded-2xl border-2 border-gray-100 bg-gray-50/80 p-3">
                          <div className="relative h-32 w-full sm:w-40 shrink-0 rounded-xl overflow-hidden border border-gray-200 bg-white">
                            {productPreviewSrc ? (
                              <img
                                src={productPreviewSrc}
                                alt="Ürün önizleme"
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center px-2 text-center text-[10px] font-bold text-gray-400">
                                Önizleme hazırlanıyor…
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 min-w-0 flex-1 justify-center">
                            {newProduct.file ? (
                              <p className="text-[10px] font-bold text-gray-600">Kaydetmeden önce yalnızca önizleme; yükleme kayıtta yapılır.</p>
                            ) : newProduct.image_url ? (
                              <p className="text-[10px] font-bold text-gray-600">Kayıtlı görsel. Yenisini seçerek değiştirebilirsiniz.</p>
                            ) : null}
                            <button
                              type="button"
                              onClick={clearProductImage}
                              className="self-start inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={14} aria-hidden />
                              Görseli kaldır
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] font-medium text-gray-400">Henüz görsel yok; aşağıdan seçebilirsiniz.</p>
                      )}
                      <input
                        ref={productFileInputRef}
                        type="file"
                        accept="image/*"
                        className="w-full text-[10px] md:text-xs font-bold text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700"
                        onChange={e => setNewProduct({ ...newProduct, file: e.target.files?.[0] ?? null })}
                      />
                    </div>
                    <button disabled={uploading} type="submit" className="w-full bg-blue-600 text-white py-4 md:py-5 rounded-2xl md:rounded-[1.5rem] font-black text-base md:text-lg shadow-xl hover:bg-blue-700 transition-all uppercase mt-4">{uploading ? "İŞLENİYOR..." : editingProductId ? "KAYDET" : "EKLE"}</button>
                </form>
            </div>
        </div>
      )}

      {categoryDeleteCtx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[55] p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-start gap-3">
              <div>
                <h3 className="font-black text-lg text-gray-900">Kategoriyi sil</h3>
                <p className="text-sm font-bold text-gray-600 mt-1">&quot;{categoryDeleteCtx.name}&quot;</p>
              </div>
              <button
                type="button"
                onClick={closeCategoryDeleteModal}
                disabled={categoryDeleteBusy}
                className="text-gray-400 hover:text-gray-900 bg-gray-100 p-2 rounded-full shrink-0 disabled:opacity-40"
                aria-label="Kapat"
              >
                <X size={22} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-gray-900">
              {categoryDeleteCtx.productCount === 0 ? (
                <p className="text-sm text-gray-600 font-medium leading-relaxed">Bu kategoride ürün yok. Silmek istediğinize emin misiniz?</p>
              ) : categories.filter((x: any) => x.id !== categoryDeleteCtx.id).length === 0 ? (
                <p className="text-sm text-gray-600 font-medium leading-relaxed">
                  Bu kategoride <strong>{categoryDeleteCtx.productCount}</strong> ürün var. Taşıyabilmek için önce başka bir kategori oluşturun; ardından ürünleri düzenleyerek taşıyın veya bu pencereden silin.
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-600 font-medium leading-relaxed">
                    Bu kategoride <strong>{categoryDeleteCtx.productCount}</strong> ürün var. Kategoriyi silmeden önce ürünleri aşağıdaki kategoriye taşıyın.
                  </p>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Hedef kategori</label>
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 p-3 rounded-xl font-bold outline-none focus:border-blue-500"
                      value={categoryDeleteCtx.moveToId}
                      onChange={(e) =>
                        setCategoryDeleteCtx((prev) => (prev ? { ...prev, moveToId: e.target.value } : null))
                      }
                      disabled={categoryDeleteBusy}
                    >
                      {categories
                        .filter((x: any) => x.id !== categoryDeleteCtx.id)
                        .map((x: any) => (
                          <option key={x.id} value={x.id}>
                            {x.name} ({x.main_group || "YİYECEKLER"})
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              )}
              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCategoryDeleteModal}
                  disabled={categoryDeleteBusy}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-500 border-2 border-gray-100 hover:bg-gray-50 disabled:opacity-40"
                >
                  İptal
                </button>
                {categoryDeleteCtx.productCount === 0 ? (
                  <button
                    type="button"
                    onClick={() => void handleConfirmCategoryDelete()}
                    disabled={categoryDeleteBusy}
                    className="flex-1 py-3 rounded-xl font-black bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                  >
                    {categoryDeleteBusy ? "Siliniyor…" : "Sil"}
                  </button>
                ) : categories.filter((x: any) => x.id !== categoryDeleteCtx.id).length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void handleConfirmCategoryDelete()}
                    disabled={categoryDeleteBusy || !categoryDeleteCtx.moveToId}
                    className="flex-1 py-3 rounded-xl font-black bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                  >
                    {categoryDeleteBusy ? "İşleniyor…" : "Ürünleri taşı ve sil"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 md:p-8 shadow-2xl">
                <div className="flex justify-between items-start gap-3 mb-6">
                  <h3 className="font-black text-lg md:text-xl text-gray-900 pr-2">{editingCategoryId ? "Kategoriyi düzenle" : "Yeni kategori"}</h3>
                  <button type="button" onClick={closeCategoryModal} className="text-gray-400 hover:text-gray-900 bg-gray-100 p-2 rounded-full shrink-0" aria-label="Kapat">
                    <X size={22} />
                  </button>
                </div>
                <form onSubmit={handleCategorySubmit} className="space-y-4 text-gray-900">
                  <datalist id="main-groups-list">
                    <option value="YİYECEKLER" />
                    <option value="İÇECEKLER" />
                    {Array.from(new Set(categories.map((c: any) => c.main_group))).filter(mg => mg && mg !== 'YİYECEKLER' && mg !== 'İÇECEKLER').map((mg: any) => (
                        <option key={mg} value={mg} />
                    ))}
                  </datalist>

                  <div className="p-4 md:p-5 bg-stone-100 rounded-2xl border border-stone-200 space-y-3">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[10px] font-black text-stone-700 uppercase tracking-widest">🇹🇷 Ana grup</span>
                      <button type="button" onClick={handleAutoTranslateCategoryMainGroup} disabled={translating} className="text-[9px] md:text-[10px] font-black bg-white text-stone-700 px-3 md:px-4 py-1.5 md:py-2 rounded-full shadow-sm flex items-center gap-1 md:gap-2 shrink-0">
                        <Sparkles size={12}/> {translating ? "..." : "ÇEVİR"}
                      </button>
                    </div>
                    <input
                      list="main-groups-list"
                      required
                      placeholder="Örn: YİYECEKLER, İÇECEKLER"
                      className="w-full bg-white p-3 md:p-4 rounded-xl font-black outline-none shadow-sm text-sm md:text-base uppercase"
                      value={newCategory.main_group}
                      onChange={e => setNewCategory({ ...newCategory, main_group: e.target.value.toLocaleUpperCase("tr-TR") })}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1">🇬🇧 English</label>
                        <input placeholder="Foods, Drinks…" className="w-full border-2 border-white p-3 rounded-xl text-xs md:text-sm font-bold outline-none bg-white" value={newCategory.main_group_en} onChange={e => setNewCategory({ ...newCategory, main_group_en: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1">🇷🇺 Russian</label>
                        <input placeholder="Еда, Напитки…" className="w-full border-2 border-white p-3 rounded-xl text-xs md:text-sm font-bold outline-none bg-white" value={newCategory.main_group_ru} onChange={e => setNewCategory({ ...newCategory, main_group_ru: e.target.value })} />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 md:p-5 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">🇹🇷 Türkçe ad</span>
                      <button type="button" onClick={handleAutoTranslateCategory} disabled={translating} className="text-[9px] md:text-[10px] font-black bg-white text-blue-600 px-3 md:px-4 py-1.5 md:py-2 rounded-full shadow-sm flex items-center gap-1 md:gap-2">
                        <Sparkles size={12}/> {translating ? "..." : "ÇEVİR"}
                      </button>
                    </div>
                    <input required placeholder="Alt Kategori (Örn: Kahvaltı, Burger)" className="w-full bg-white p-3 md:p-4 rounded-xl font-black outline-none shadow-sm text-sm md:text-base" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase ml-1">🇬🇧 English</label>
                      <input placeholder="Name" className="w-full border-2 border-gray-50 p-3 rounded-xl text-xs md:text-sm font-bold outline-none" value={newCategory.name_en} onChange={e => setNewCategory({...newCategory, name_en: e.target.value})} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase ml-1">🇷🇺 Russian</label>
                      <input placeholder="Название" className="w-full border-2 border-gray-50 p-3 rounded-xl text-xs md:text-sm font-bold outline-none" value={newCategory.name_ru} onChange={e => setNewCategory({...newCategory, name_ru: e.target.value})} />
                    </div>
                  </div>

                  <div className="flex gap-3 md:gap-4 pt-2">
                    <button type="button" onClick={closeCategoryModal} className="flex-1 font-bold text-gray-400 text-sm md:text-base">İptal</button>
                    <button type="submit" className="flex-1 bg-blue-600 text-white py-3 md:py-4 rounded-2xl font-black shadow-lg text-sm md:text-base">{editingCategoryId ? "Kaydet" : "Ekle"}</button>
                  </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}