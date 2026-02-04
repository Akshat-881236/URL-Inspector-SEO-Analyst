const ALLOWED_PREFIX = "https://akshat-881236.github.io/";

function showTab(id){
 document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
 document.querySelectorAll(".tabs button").forEach(b=>b.classList.remove("active"));
 document.getElementById(id).classList.add("active");
 event.target.classList.add("active");
}

async function inspect(){
 const url = urlInput.value.trim();
 msg.textContent="";

 if(!url.startsWith(ALLOWED_PREFIX)){
   msg.textContent="Only Akshat Network Hub URLs are allowed.";
   return;
 }

 frame.src = url;

 try{
   const res = await fetch(url);
   const html = await res.text();
   sourceCode.textContent = html;

   const doc = new DOMParser().parseFromString(html,"text/html");
   seoData.innerHTML = `
     <li><b>Title:</b> ${doc.title || "Not Found"}</li>
     <li><b>Description:</b> ${doc.querySelector('meta[name="description"]')?.content || "Not Found"}</li>
     <li><b>Keywords:</b> ${doc.querySelector('meta[name="keywords"]')?.content || "Not Found"}</li>
     <li><b>H1 Count:</b> ${doc.querySelectorAll("h1").length}</li>
     <li><b>H2 Count:</b> ${doc.querySelectorAll("h2").length}</li>
     <li><b>Links:</b> ${doc.querySelectorAll("a").length}</li>
     <li><b>Images:</b> ${doc.querySelectorAll("img").length}</li>
   `;
 }catch(e){
   msg.textContent="Unable to fetch source (CORS or network issue).";
 }
}