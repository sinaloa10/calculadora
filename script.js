// ===== script.js =====

// URL del backend
const BACKEND_URL = "https://calculadora-back.onrender.com/";

// ——— Elementos del DOM ———
const videoElem        = document.getElementById("video");
const scannerContainer = document.getElementById("scanner-container");
const formProducto     = document.getElementById("formulario-producto");
const toastElem        = document.getElementById("toast");
let scannerIniciado    = false;

// Al cargar, oculta cámara y formulario
scannerContainer.style.display = "none";
formProducto.style.display     = "none";

// ——— Función para reproducir un 'pip' ———
function playBeep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = 1000;
  osc.connect(ctx.destination);
  osc.start();
  setTimeout(() => osc.stop(), 100);
}

// ——— Toast helper ———
function mostrarToast(msg, dur = 3000) {
  toastElem.textContent = msg;
  toastElem.classList.add("show");
  setTimeout(() => toastElem.classList.remove("show"), dur);
}

// ——— Obtención de valores de inputs ———
const obtenerValor = id => Math.max(0, +document.getElementById(id).value || 0);
const obtenerReciclaje = () =>
  ["papel","plastico","vidrio","electronico"]
    .filter(id => document.getElementById(`rec_${id}`).checked);

// ——— Botón: iniciar escáner ———
document.getElementById("btnIniciarScanner").addEventListener("click", async () => {
  if (scannerIniciado) return;
  scannerIniciado = true;

  // 1) muestra la cámara
  scannerContainer.style.display = "flex";

  // 2) solicita permisos y asigna stream
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    videoElem.srcObject = stream;
    await videoElem.play();
  } catch (err) {
    console.error("No hay acceso a la cámara:", err);
    mostrarToast("No se pudo acceder al video 📵");
    scannerIniciado = false;
    return;
  }

  // 3) inicializa Quagga
  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: videoElem,
      constraints: { facingMode: "environment" }
    },
    decoder: {
      readers: ["ean_reader","code_128_reader","upc_reader"]
    },
    locate: true
  }, err => {
    if (err) {
      console.error("Error al iniciar Quagga:", err);
      mostrarToast("No se pudo iniciar el escáner 📵");
      scannerIniciado = false;
      return;
    }
    Quagga.start();
    mostrarToast("Escáner activo, apunta al código 📷");
  });

  // 4) debug: dibuja cajas amarillas de posibles códigos
  Quagga.onProcessed(result => {
    const ctx    = Quagga.canvas.ctx.overlay;
    const canvas = Quagga.canvas.dom.overlay;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (result && result.boxes) {
      result.boxes.forEach(box => {
        ctx.strokeStyle = "yellow";
        ctx.lineWidth   = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
      });
    }
  });
});

// ——— Detección de código ———
Quagga.onDetected(async data => {
  const codigo = data.codeResult.code;
  playBeep();

  // 1) detiene Quagga y flag
  Quagga.stop();
  scannerIniciado = false;

  // 2) detiene el stream de la cámara
  if (videoElem.srcObject) {
    videoElem.srcObject.getTracks().forEach(t => t.stop());
    videoElem.srcObject = null;
  }

  // 3) oculta el contenedor de la cámara
  scannerContainer.style.display = "none";

  // 4) muestra el formulario con el ID detectado
  formProducto.style.display = "block";
  document.getElementById("producto-id").value         = codigo;
  document.getElementById("codigo-detectado").textContent = `ID detectado: ${codigo}`;

  // 5) opcional: fetch de info producto
  let info;
  try {
    const res = await fetch(`${BACKEND_URL}/api/productos/${codigo}`);
    if (res.ok) info = await res.json();
  } catch (e) {
    console.warn("Fetch producto falló:", e);
  }

  const infoDiv = document.getElementById("producto-info");
  if (info) {
    infoDiv.innerHTML = `
      <table>
        <tr><th>ID</th><th>Nombre</th><th>Descripción</th></tr>
        <tr>
          <td>${info.id}</td>
          <td>${info.nombre}</td>
          <td>${info.descripcion || "-"}</td>
        </tr>
      </table>`;
    document.getElementById("producto-nombre").value = info.nombre;
  } else {
    infoDiv.innerHTML = "<p>No se encontraron datos; completa manualmente.</p>";
  }
});

// ——— Verificar producto manual ———
document.getElementById("btnVerificarProducto").addEventListener("click", () => {
  const nombre = document.getElementById("producto-nombre").value.trim();
  if (!nombre) return mostrarToast("Ingresa el nombre del producto.");
  mostrarToast("Producto verificado 👍: " + nombre);
});

// ——— Botón: calcular huella ———
document.getElementById("btnCalcular").addEventListener("click", async () => {
  const usuario = document.getElementById("usuario").value.trim();
  if (!usuario) return mostrarToast("Por favor ingresa un nombre de usuario.");

  const datos = {
    usuario,
    kms: {
      auto: obtenerValor("auto"),
      bus: obtenerValor("bus"),
      avion: obtenerValor("avion"),
      moto: obtenerValor("moto"),
      bici_electrica: obtenerValor("bici_electrica")
    },
    electricidad: obtenerValor("electricidad"),
    agua: obtenerValor("agua"),
    compras: obtenerValor("compras"),
    dieta: document.getElementById("dieta").value,
    reciclaje: obtenerReciclaje()
  };

  const btn = document.getElementById("btnCalcular");
  btn.disabled   = true;
  const original = btn.textContent;
  btn.innerHTML  = '<span class="loader"></span> Calculando...';

  try {
    const res  = await fetch(`${BACKEND_URL}/api/calcular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    });
    const data = await res.json();
    document.getElementById("resultado").innerHTML = `
      <h3>Resultado</h3>
      <p><strong>Huella:</strong> ${data.huella} kg CO₂ / semana</p>
      <p><strong>Recomendación:</strong> ${data.recomendacion}</p>
    `;
    mostrarHistorial(usuario);
    mostrarToast("¡Huella calculada con éxito! 🌱");
    generarGrafica(data.detalle || {});
  } catch {
    const demo = {
      huella: 26.6,
      recomendacion: "Reduce tus trayectos en coche y mejora hábitos de reciclaje.",
      detalle: { transporte:12.3, electricidad:8.4, agua:2.1, compras:1.7, dieta:3.6, reciclaje:-1.5 }
    };
    document.getElementById("resultado").innerHTML = `
      <h3>Resultado (DEMO)</h3>
      <p><strong>Huella:</strong> ${demo.huella} kg CO₂ / semana</p>
      <p><strong>Recomendación:</strong> ${demo.recomendacion}</p>
    `;
    generarGrafica(demo.detalle);
    mostrarToast("Modo DEMO: datos simulados cargados");
  } finally {
    btn.disabled   = false;
    btn.textContent = original;
  }
});

// ——— Mostrar historial ———
async function mostrarHistorial(usuario) {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/historial?usuario=${encodeURIComponent(usuario)}`);
    const hist = await res.json();
    if (!hist.length) {
      document.getElementById("historial").innerHTML = "<p>No hay historial para este usuario.</p>";
      return;
    }
    let html = "<h3>Historial del usuario</h3>";
    hist.forEach((item, i) => {
      html += `
        <div>
          <strong>#${i+1}</strong> - ${new Date(item.fecha).toLocaleString()}<br>
          Huella: ${item.total.toFixed(2)} kg<br>
          KMs: ${JSON.stringify(item.kms)}
        </div><hr>`;
    });
    document.getElementById("historial").innerHTML = html;
  } catch {
    document.getElementById("historial").innerHTML = "<p>Error al cargar historial.</p>";
  }
}

// ——— Generar gráfica ———
function generarGrafica(detalle) {
  const ctx = document.getElementById("graficaHuella").getContext("2d");
  if (window.grafica) window.grafica.destroy();
  window.grafica = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(detalle),
      datasets: [{ label: "Emisiones (kg CO₂)", data: Object.values(detalle) }]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

// ——— Chatbot ecológico ———
const respuestas = {
  "reciclar":"Puedes reciclar papel, plástico, vidrio y electrónicos.",
  "plantar árboles": "Los mejores lugares para plantar árboles son parques y jardines."
};

document.getElementById("btnEnviarChat").addEventListener("click", () => {
  const input = document.getElementById("chatInput");
  const msg   = input.value.trim();
  if (!msg) return;
  const log = document.getElementById("chatlog");
  log.innerHTML += `<p><strong>Tú:</strong> ${msg}</p>`;
  input.value = "";
  let resp = "Lo siento, por el momento estoy en desarrollo. Prueba con escribir en el chat: reciclar o plantar árboles";
  for (const clave in respuestas) {
    if (msg.toLowerCase().includes(clave)) {
      resp = respuestas[clave];
      break;
    }
  }
  log.innerHTML += `<p><strong>EVA:</strong> ${resp}</p>`;
  log.scrollTop = log.scrollHeight;
});

// ——— Inicializar mapa con Leaflet ———
window.addEventListener("DOMContentLoaded", () => {
  const mapa = L.map("mapa").setView([28.63563, -106.08889], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(mapa);

  const puntos = [
    { nombre: "Parque El Palomar", coords: [28.639178, -106.085689] },
    { nombre: "Parque Metropolitano Tres Presas El Rejón", coords: [28.651111, -106.141111] },
    { nombre: "Parque Infantil DIF", coords: [28.65889, -106.08021] },
    { nombre: "Parque Lerdo de Tejada", coords: [28.635, -106.073333] },
    { nombre: "Jardín Botánico del Desierto", coords: [31.68708, -106.42806] },
    { nombre: "Jardín Tec II", coords: [28.70828, -106.10704] }
  ];
  puntos.forEach(p =>
    L.marker(p.coords).addTo(mapa).bindPopup(`<strong>${p.nombre}</strong>`)
  );

  const ley = L.control({ position: "topright" });
  ley.onAdd = () => {
    const div = L.DomUtil.create("div", "info-leyenda");
    div.innerHTML = '<span title="Áreas verdes">🌿 Áreas verdes</span>';
    return div;
  };
  ley.addTo(mapa);
});
