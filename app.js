(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const config = window.LIBRARY_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
  let client = null, currentUser = null, allBooks = [], editingBookId = null;

  if (configured) client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  const sampleBooks = [
    {id:"sample-1",title:"Decisions Under Pressure",author:"Prashant Latta",category:"Decision-making",language:"English",description:"An exploration of risk, negotiation, power, and the decisions people make when the stakes are high.",content:"<p><em>Sample preview — replace this with your published book content.</em></p><h2>Introduction</h2><p>Pressure changes the way we see choices. It narrows attention, amplifies fear, and makes every decision feel more urgent than it may truly be.</p><p>This digital archive is a home for ideas worth examining slowly. The full book can be added from the secure Admin Dashboard after the backend is configured.</p>",published:true},
    {id:"sample-2",title:"Bheed Se Bhitar Tak",author:"Prashant Latta",category:"Identity & society",language:"Hindi",description:"A reflective journey from the noise of the crowd toward a clearer understanding of the self.",content:"<p><em>नमूना परिचय — इसे अपनी प्रकाशित पुस्तक की वास्तविक सामग्री से बदलें।</em></p><h2>भूमिका</h2><p>भीड़ में रहना और स्वयं को समझना, दोनों अलग अनुभव हैं। कभी-कभी सबसे जरूरी यात्रा बाहर की दुनिया में नहीं, बल्कि अपने विचारों के भीतर शुरू होती है।</p><p>इस डिजिटल लाइब्रेरी में पूरी पुस्तक जोड़ने के लिए सुरक्षित Admin Dashboard कॉन्फ़िगर करें।</p>",published:true},
    {id:"sample-3",title:"Asur",author:"Prashant Latta",category:"Mythology & ideas",language:"Hindi",description:"A literary exploration of ancient stories, difficult questions, and the many sides of human nature.",content:"<p><em>नमूना परिचय — इसे अपनी पुस्तक की वास्तविक सामग्री से बदलें।</em></p><h2>एक प्रश्न से शुरुआत</h2><p>कहानियाँ केवल अतीत का वर्णन नहीं करतीं; वे उन प्रश्नों को भी सामने लाती हैं जिनसे हर पीढ़ी को दोबारा गुजरना पड़ता है।</p><p>यह केवल डेमो सामग्री है, पूरी पुस्तक नहीं।</p>",published:true}
  ];

  function escapeHTML(value="") { return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
  function safeContent(value="") {
    // Minimal allow-list sanitizer for reader content. For high-risk multi-author publishing, use a proven sanitizer server-side.
    const template = document.createElement("template");
    template.innerHTML = String(value);
    const allowed = new Set(["P","BR","H1","H2","H3","H4","STRONG","B","EM","I","UL","OL","LI","BLOCKQUOTE","HR","A"]);
    const walk = (node) => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (!allowed.has(child.tagName)) {
            child.replaceWith(document.createTextNode(child.textContent || ""));
          } else {
            [...child.attributes].forEach(attr => {
              if (child.tagName !== "A" || !["href","title"].includes(attr.name.toLowerCase())) child.removeAttribute(attr.name);
            });
            if (child.tagName === "A") {
              const href = child.getAttribute("href") || "";
              if (!/^https?:\/\//i.test(href)) child.removeAttribute("href");
              child.setAttribute("rel","noopener noreferrer");
              child.setAttribute("target","_blank");
            }
            walk(child);
          }
        } else if (child.nodeType === Node.COMMENT_NODE) child.remove();
      });
    };
    walk(template.content);
    return template.innerHTML;
  }
  function toast(message, error=false) { const el=$("toast"); el.textContent=message; el.classList.toggle("error",error); el.classList.remove("hidden"); setTimeout(()=>el.classList.add("hidden"),3500); }
  function setMessage(id,message,success=false) { const el=$(id); el.textContent=message; el.classList.toggle("success",success); }
  function showModal(id) { $(id).classList.remove("hidden"); document.body.style.overflow="hidden"; }
  function hideModal(id) { $(id).classList.add("hidden"); if (![...document.querySelectorAll(".modal-backdrop")].some(el=>!el.classList.contains("hidden"))) document.body.style.overflow=""; }
  document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>hideModal(btn.dataset.close)));
  document.querySelectorAll(".modal-backdrop").forEach(backdrop=>backdrop.addEventListener("click",e=>{if(e.target===backdrop)hideModal(backdrop.id)}));
  $("year").textContent = new Date().getFullYear();
  $("search-focus").addEventListener("click",()=>{$("library").scrollIntoView({behavior:"smooth"});setTimeout(()=>$("search-input").focus(),350)});
  $("search-input").addEventListener("input",renderBooks);
  $("category-filter").addEventListener("change",renderBooks);
  $("language-filter").addEventListener("change",renderBooks);
  $("clear-filters").addEventListener("click",()=>{$("search-input").value="";$("category-filter").value="all";$("language-filter").value="all";renderBooks()});
  $("admin-open").addEventListener("click",async()=>{showModal("admin-modal");if(!configured){showLogin();setMessage("login-message","Admin setup is not configured yet. Follow README.md to connect Supabase.",false);return;} await refreshSession();});
  $("login-form").addEventListener("submit",async e=>{
    e.preventDefault(); if(!configured){setMessage("login-message","Configure Supabase first using README.md.");return;}
    setMessage("login-message","Signing in…");
    const {data,error}=await client.auth.signInWithPassword({email:$("admin-email").value.trim(),password:$("admin-password").value});
    if(error){setMessage("login-message",error.message);return;}
    currentUser=data.user; await showDashboard();
  });
  $("logout-button").addEventListener("click",async()=>{if(client) await client.auth.signOut();currentUser=null;showLogin();toast("You have been signed out.")});
  $("new-book-button").addEventListener("click",()=>openBookForm());
  $("cancel-book").addEventListener("click",()=>resetBookForm());
  $("book-form").addEventListener("submit",saveBook);
  if (client) client.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null; if(currentUser && !$("admin-dashboard-view").classList.contains("hidden")) showDashboard();});
  refreshLibrary();

  async function refreshSession(){if(!client)return;const {data}=await client.auth.getSession();currentUser=data.session?.user||null;if(currentUser)await showDashboard();else showLogin();}
  function showLogin(){$("admin-login-view").classList.remove("hidden");$("admin-dashboard-view").classList.add("hidden");}
  async function showDashboard(){
    if(!currentUser){showLogin();return;}
    $("admin-login-view").classList.add("hidden");$("admin-dashboard-view").classList.remove("hidden");
    $("admin-welcome").textContent=`Signed in as ${currentUser.email}.`;
    await loadAdminBooks();
  }
  async function refreshLibrary(){
    if(configured){
      const {data,error}=await client.from("books").select("id,title,author,category,language,description,content,cover_url,published,created_at").eq("published",true).order("created_at",{ascending:false});
      if(error){console.error(error);allBooks=[];renderBooks();$("results-count").textContent="Library could not load — check setup";return;}
      allBooks=data||[];
    } else {
      allBooks=sampleBooks.filter(b=>b.published);
    }
    populateFilters();renderBooks();
  }
  function populateFilters(){
    const categories=[...new Set(allBooks.map(b=>b.category).filter(Boolean))].sort();
    const languages=[...new Set(allBooks.map(b=>b.language).filter(Boolean))].sort();
    const fill=(id,items,label)=>{const el=$(id),old=el.value;el.innerHTML=`<option value="all">${label}</option>`+items.map(v=>`<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join("");el.value=items.includes(old)?old:"all";};
    fill("category-filter",categories,"All topics");fill("language-filter",languages,"All languages");
  }
  function coverMarkup(book,index){
    if(book.cover_url && /^https?:\/\//i.test(book.cover_url))return `<img src="${escapeHTML(book.cover_url)}" alt="Cover of ${escapeHTML(book.title)}" loading="lazy" onerror="this.remove()">`;
    const initials=(book.title||"PL").split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase();
    return `<div class="cover-placeholder"><span class="cover-number">PL BOOKS / ${String(index+1).padStart(2,"0")}</span><span class="cover-initials">${escapeHTML(initials)}</span><span class="cover-bottom">PRASHANT LATTA · DIGITAL ARCHIVE</span></div>`;
  }
  function renderBooks(){
    const query=$("search-input").value.trim().toLowerCase(),cat=$("category-filter").value,lang=$("language-filter").value;
    const books=allBooks.filter(b=>(!query||[b.title,b.author,b.category,b.description,b.language].some(v=>String(v||"").toLowerCase().includes(query)))&&(cat==="all"||b.category===cat)&&(lang==="all"||b.language===lang));
    $("stat-books").textContent=String(allBooks.length).padStart(2,"0");
    $("results-count").textContent=`SHOWING ${books.length} OF ${allBooks.length} BOOK${allBooks.length===1?"":"S"}`;
    $("library-grid").innerHTML=books.map((b,i)=>`<article class="book-card"><div class="cover-wrap">${coverMarkup(b,i)}</div><div class="book-card-body"><div class="book-category">${escapeHTML(b.category||"From the archive")}</div><h3>${escapeHTML(b.title)}</h3><div class="book-author">By ${escapeHTML(b.author||"Prashant Latta")}</div><p class="book-description">${escapeHTML(b.description||"A book from the Prashant Latta digital archive.")}</p><div class="card-bottom"><span class="language-pill">${escapeHTML(b.language||"English")}</span><button class="read-link" data-read="${escapeHTML(b.id)}">Read online <span>→</span></button></div></div></article>`).join("");
    $("empty-state").classList.toggle("hidden",books.length!==0);
    $("library-grid").classList.toggle("hidden",books.length===0);
    $("library-grid").querySelectorAll("[data-read]").forEach(btn=>btn.addEventListener("click",()=>openReader(btn.dataset.read)));
  }
  async function openReader(id){
    let book=allBooks.find(b=>String(b.id)===String(id));
    if(configured){const {data,error}=await client.from("books").select("id,title,author,category,language,description,content").eq("id",id).eq("published",true).maybeSingle();if(error||!data){toast("This book could not be opened.",true);return;}book=data;}
    if(!book)return;
    $("reader-category").textContent=(book.category||"BOOK").toUpperCase();
    $("reader-language").textContent=(book.language||"ENGLISH").toUpperCase();
    $("modal-title").textContent=book.title||"Untitled";
    $("reader-byline").textContent=`By ${book.author||"Prashant Latta"}`;
    $("reader-content").innerHTML=safeContent(book.content||"<p>Reading content has not been added yet.</p>");
    showModal("book-modal");
  }
  async function loadAdminBooks(){
    if(!client||!currentUser)return;
    const {data,error}=await client.from("books").select("*").order("created_at",{ascending:false});
    if(error){$("admin-book-list").innerHTML=`<p class="form-message">Could not load books: ${escapeHTML(error.message)}. Check database policies.</p>`;return;}
    const books=data||[];$("admin-book-count").textContent=`${books.length} book${books.length===1?"":"s"}`;
    $("admin-book-list").innerHTML=books.map(b=>`<div class="admin-book-row"><div><strong>${escapeHTML(b.title)}</strong><small>${b.published?"PUBLISHED":"DRAFT"} · ${escapeHTML(b.language||"")} · ${escapeHTML(b.category||"")}</small></div><div class="admin-book-actions"><button class="mini-button" data-edit="${escapeHTML(b.id)}">Edit</button><button class="mini-button" data-toggle="${escapeHTML(b.id)}" data-published="${b.published}">${b.published?"Unpublish":"Publish"}</button><button class="mini-button danger" data-delete="${escapeHTML(b.id)}">Delete</button></div></div>`).join("")||"<p class='muted'>No books yet. Add your first book above.</p>";
    $("admin-book-list").querySelectorAll("[data-edit]").forEach(btn=>btn.addEventListener("click",()=>editBook(btn.dataset.edit)));
    $("admin-book-list").querySelectorAll("[data-toggle]").forEach(btn=>btn.addEventListener("click",()=>toggleBook(btn.dataset.toggle,btn.dataset.published==="true")));
    $("admin-book-list").querySelectorAll("[data-delete]").forEach(btn=>btn.addEventListener("click",()=>deleteBook(btn.dataset.delete)));
  }
  function openBookForm(book=null){
    editingBookId=book?.id||null;$("book-id").value=editingBookId||"";
    $("book-title").value=book?.title||"";$("book-author").value=book?.author||"Prashant Latta";
    $("book-category").value=book?.category||"";$("book-language").value=book?.language||"English";
    $("book-cover").value=book?.cover_url||"";$("book-description").value=book?.description||"";
    $("book-content").value=book?.content||"";$("book-published").checked=Boolean(book?.published);
    $("book-form").classList.remove("hidden");setMessage("book-message","");
    $("book-form").scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  function resetBookForm(){$("book-form").classList.add("hidden");$("book-form").reset();$("book-author").value="Prashant Latta";$("book-language").value="English";editingBookId=null;setMessage("book-message","");}
  async function editBook(id){const {data,error}=await client.from("books").select("*").eq("id",id).single();if(error){toast(error.message,true);return;}openBookForm(data);}
  async function saveBook(e){
    e.preventDefault();if(!client||!currentUser){setMessage("book-message","Please sign in first.");return;}
    const record={title:$("book-title").value.trim(),author:$("book-author").value.trim(),category:$("book-category").value.trim()||"General",language:$("book-language").value.trim()||"English",cover_url:$("book-cover").value.trim()||null,description:$("book-description").value.trim(),content:$("book-content").value,published:$("book-published").checked};
    setMessage("book-message","Saving…");
    const result=editingBookId?await client.from("books").update(record).eq("id",editingBookId).select().single():await client.from("books").insert(record).select().single();
    if(result.error){setMessage("book-message",result.error.message);return;}
    setMessage("book-message","Saved successfully.",true);toast("Book saved.");resetBookForm();await loadAdminBooks();await refreshLibrary();
  }
  async function toggleBook(id,published){const {error}=await client.from("books").update({published:!published}).eq("id",id);if(error){toast(error.message,true);return;}toast(published?"Book unpublished.":"Book published.");await loadAdminBooks();await refreshLibrary();}
  async function deleteBook(id){if(!confirm("Delete this book permanently? This cannot be undone."))return;const {error}=await client.from("books").delete().eq("id",id);if(error){toast(error.message,true);return;}toast("Book deleted.");await loadAdminBooks();await refreshLibrary();}
})();
