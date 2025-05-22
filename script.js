const BACKEND_URL = "https://calculadora-back.onrender.com/"; // reemplaza por tu URL real

async function calcularHuella() {
  const usuario = document.getElementById("usuario").value.trim();
  if (!usuario) {
    alert("Por favor ingresa un nombre de usuario.");
    return;
  }

  const kms = {
    auto: +document.getElementById("auto").value || 0,
    bus: +document.getElementById("bus").value || 0,
    avion: +document.getElementById("avion").value || 0,
    moto: +document.getElementById("moto").value || 0,
    bici_electrica: +document.getElementById("bici_electrica").value || 0
  };

  const response = await fetch(`${BACKEND_URL}/api/calcular`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, kms })
  });

  const data = await response.json();
  document.getElementById("resultado").innerHTML = `
    <h3>Resultado</h3>
    <p><strong>Huella:</strong> ${data.huella} kg CO₂ / semana</p>
    <p><strong>Recomendación:</strong> ${data.recomendacion}</p>
  `;

  mostrarHistorial(usuario);
}

async function mostrarHistorial(usuario) {
  const response = await fetch(`${BACKEND_URL}/api/historial?usuario=${encodeURIComponent(usuario)}`);
  const historial = await response.json();

  if (historial.length === 0) {
    document.getElementById("historial").innerHTML = "<p>No hay historial para este usuario.</p>";
    return;
  }

  let html = "<h3>Historial del usuario</h3>";
  historial.forEach((item, i) => {
    html += `
      <div>
        <strong>#${i + 1}</strong> - Huella: ${item.total.toFixed(2)} kg<br>
        KMs: ${JSON.stringify(item.kms)}
      </div><hr>
    `;
  });

  document.getElementById("historial").innerHTML = html;
}
