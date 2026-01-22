// Handles NSL analysis including DA selection and risk assessment

function openNSLPanel(panelKey) {
  const panels = [
    "daSelectionPanel",
    "riskAssessmentPanel",
    "modelOutputPanel"
  ];

  panels.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === panelKey + "Panel") ? "flex" : "none";
  });
}

function openDAPanel() {
  openNSLPanel("daSelection");
  populateDATable();
}

function closeDAPanel() {
  document.getElementById("daSelectionPanel").style.display = "none";
}

function clearDASelection() {
  document.getElementById("projectTitle").value = "";
  document.getElementById("cecNumber").value = "";
  const selects = document.querySelectorAll("#daTableBody select");
  selects.forEach(sel => sel.value = "No");
}

function confirmDASelection() {
  const projectTitle = document.getElementById("projectTitle").value;
  const cecNumber = document.getElementById("cecNumber").value;
  const selections = [];

  const rows = document.querySelectorAll("#daTableBody tr");
  rows.forEach(row => {
    const code = row.dataset.code;
    const description = row.querySelector(".desc").textContent;
    const selection = row.querySelector("select").value;
    selections.push({ code, description, selection });
  });

  const selectedActivities = selections.filter(s => s.selection === "Yes");

  window.nslData = { projectTitle, cecNumber, selectedActivities };

  openRiskPanel();
}

function populateDATable() {
  const tbody = document.getElementById("daTableBody");
  tbody.innerHTML = "";

  designatedActivities.forEach(da => {
    const row = document.createElement("tr");
    row.dataset.code = da.code;

    row.innerHTML = `
      <td>${da.code}</td>
      <td class="desc">${da.description}</td>
      <td>
        <select>
          <option>No</option>
          <option>Yes</option>
        </select>
      </td>
    `;

    tbody.appendChild(row);
  });
}

function openRiskPanel() {
  if (!window.nslData || !window.nslData.selectedActivities?.length) {
    alert("No DA Selection data found. Please complete the Designated Activity Selection first.");
    return;
  }

  const titleDisplay = document.getElementById("riskProjectTitle");
  const cecInput = document.getElementById("riskCecNumber");
  const tbody = document.getElementById("riskTableBody");

  titleDisplay.textContent = window.nslData.projectTitle || "";
  cecInput.value = window.nslData.cecNumber || "";

  tbody.innerHTML = "";

  const riskOptions = ["N/A", "Very Low", "Low", "Moderate", "High", "Very High"];

  window.nslData.selectedActivities.forEach(activity => {
    const code = activity.code;
	const risk = riskDefinitions[code] || {};
	const natureText = risk.NatureDefinition || "No guidance available.";
	const scaleText = risk.ScaleDefinition || "No guidance available.";
	const locationText = risk.LocationDefinition || "No guidance available.";


    const row = document.createElement("tr");

	row.innerHTML = `
	  <td>${code}</td>
	  <td><select>${riskOptions.map(opt => `<option>${opt}</option>`).join("")}</select></td>
	  <td><select>${riskOptions.map(opt => `<option>${opt}</option>`).join("")}</select></td>
	  <td><select>${riskOptions.map(opt => `<option>${opt}</option>`).join("")}</select></td>
	  <td class="guidance" colspan="1">${natureText}</td>
	  <td class="guidance" colspan="1">${scaleText}</td>
	  <td class="guidance" colspan="1">${locationText}</td>
	`;


    tbody.appendChild(row);
  });

  openNSLPanel("riskAssessment");
}

function closeRiskPanel() {
  document.getElementById("riskAssessmentPanel").style.display = "none";
}

function confirmRiskAssessment() {
  const rows = document.querySelectorAll("#riskTableBody tr");

  const riskSelections = Array.from(rows).map(row => {
    const code = row.cells[0].textContent;
    const nature = row.cells[1].querySelector("select").value;
    const scale = row.cells[2].querySelector("select").value;
    const location = row.cells[3].querySelector("select").value;
    return { code, nature, scale, location };
  });

  // Store in nslData
  window.nslData.riskRatings = riskSelections;

  openModelOutputPanel();
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

function openModelOutputPanel() {
    ["daSelectionPanel", "riskAssessmentPanel", "modelOutputPanel"].forEach(id => {
	  const panel = document.getElementById(id);
      if (panel) panel.style.display = "none";
	});
  
  const data = window.nslData;
  if (!data || !data.riskRatings?.length) return;

  // Populate project info
  document.getElementById("outputProjectTitle").textContent = data.projectTitle || "";
  document.getElementById("outputCecNumber").textContent = data.cecNumber || "";

  // Populate DA codes
  const selectedCodes = data.selectedActivities?.map(a => a.code).join(", ") || "None";
  document.getElementById("outputDAList").textContent = selectedCodes;

  // Score mapping
  const scoreMap = {
    "N/A": 0,
    "Very Low": 1,
    "Low": 2,
    "Moderate": 3,
    "High": 4,
    "Very High": 5
  };

  let maxTotal = 0;
  let userScore = 0;

  // For rule lookup
  const ruleScoreArray = [];

  data.riskRatings.forEach(entry => {
    const nature = scoreMap[entry.nature] || 0;
    const scale = scoreMap[entry.scale] || 0;
    const location = scoreMap[entry.location] || 0;

	const weights = daWeights[entry.code] || { nature: 1, scale: 1, location: 1 };

	userScore += (nature * weights.nature) + (scale * weights.scale) + (location * weights.location);
	maxTotal += (5 * weights.nature) + (5 * weights.scale) + (5 * weights.location);

    ruleScoreArray.push(nature, scale, location);
  });

  const percentage = maxTotal ? Math.round((userScore / maxTotal) * 100) : 0;
  const thresholds = data.selectedActivities.map(a => daThresholds[a.code] || { threshold: 75, upper: 80, lower: 70 });

	// Average thresholds
  const avg = (arr, key) => arr.reduce((sum, o) => sum + (o[key] || 0), 0) / arr.length;

  const threshold = Math.round(avg(thresholds, "threshold"));
  const upper = Math.round(avg(thresholds, "upper"));
  const lower = Math.round(avg(thresholds, "lower"));

	// Decision based on boundaries
	let decisionText = "";
	let detailText = "";

	if (percentage < lower) {
	  decisionText = `<span style="color:green;font-weight:bold;">EIA SOP is not required</span>`;
	  detailText = `Information provided by applicant is believed to be complete and/or sufficient to assess environmental impact and determine mitigation measures without the need for an EIA. Low acute and cumulative risks to human health and the environment have been determined with acceptable confidence. Considerations beyond the scope of this model must be taken into account to justify contrary action.`;
	} else if (percentage < threshold) {
	  decisionText = `<span style="color:green;font-weight:bold;">EIA SOP is not recommended</span>`;
	  detailText = `Information provided by applicant is believed to be complete and/or sufficient to assess environmental impact and determine mitigation measures without the need for an EIA. Manageable acute and cumulative risks to human health and the environment have been determined with acceptable confidence. Contrary action to this Model suggestion is available at the Officer's discretion.`;
	} else if (percentage < upper) {
	  decisionText = `<span style="color:orange;font-weight:bold;">EIA SOP is recommended</span>`;
	  detailText = `Information reveals areas of concern that may benefit from a more thorough screening assessment. Acute and cumulative risks to human health and the environment may be managed based on existing knowledge. Contrary action to this Model suggestion is available at the Officer's discretion.`;
	} else {
	  decisionText = `<span style="color:red;font-weight:bold;">EIA SOP is required</span>`;
	  detailText = `Information provided by applicant is believed to be insufficient and/or indicates high likelihood of significant impact to human health and environment. A more thorough screening is required to determine the extent of risk and/or appropriate mitigation measures.`;
	}

	document.getElementById("nslSummaryContainer").innerHTML = `
	  <strong>NSL Index:</strong> ${percentage}%<br/>
	  <strong>NSL Threshold:</strong> ${threshold}%<br/>
	  <strong>Upper Bound:</strong> ${upper}%<br/>
	  <strong>Lower Bound:</strong> ${lower}%<br/>
	  <strong>NSL Index Decision:</strong> ${decisionText}
	`;

document.getElementById("nslDetailContainer").textContent = detailText;




  document.getElementById("nslDetailContainer").textContent = detailText;

  drawNSLChart(percentage);

  // Date stamp
  document.getElementById("modelDateStamp").textContent =
    "Date: " + new Date().toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric"
    });

  document.getElementById("modelOutputPanel").style.display = "flex";
}

function drawNSLChart(score) {
  const ctx = document.getElementById("nslChart").getContext("2d");
  if (window.nslChartInstance) window.nslChartInstance.destroy();

  const threshold = 75;
  const upper = 80;
  const lower = 70;
  const cecLabel = window.nslData?.cecNumber || "CEC";

  const dotColor =
    score < threshold ? "green" :
    score > threshold ? "red" : "darkgray";

  window.nslChartInstance = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          type: 'scatter',
          label: "NSL Score",
          data: [{ x: 1, y: score }],
          backgroundColor: dotColor,
          pointRadius: 6
        },
        {
          type: 'line',
          label: "Threshold (75%)",
          data: [
            { x: 0.5, y: threshold },
            { x: 1.5, y: threshold }
          ],
          borderColor: "orange",
          borderWidth: 2,
          borderDash: [],
          fill: false
        },
        {
          type: 'line',
          label: "Upper DB (80%)",
          data: [
            { x: 0.5, y: upper },
            { x: 1.5, y: upper }
          ],
          borderColor: "#444",
          borderWidth: 1.5,
          borderDash: [6, 4],
          fill: false
        },
        {
          type: 'line',
          label: "Lower DB (70%)",
          data: [
            { x: 0.5, y: lower },
            { x: 1.5, y: lower }
          ],
          borderColor: "#5a9bd3",
          borderWidth: 1.5,
          borderDash: [6, 4],
          fill: false
        }
      ]
    },
    options: {
      plugins: {
        legend: {
          display: true,
          position: "top"
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 2,
          ticks: {
            callback: function (val) {
              return val === 1 ? cecLabel : "";
            }
          },
          title: {
            display: true,
            text: "CEC Number"
          },
          grid: {
            drawTicks: false
          }
        },
        y: {
          min: 0,
          max: 100,
          title: {
            display: true,
            text: "NSL Index (%)"
          }
        }
      }
    }
  });
}

function closeModelOutputPanel() {
  document.getElementById("modelOutputPanel").style.display = "none";
  document.body.classList.remove("modal-open");
}

async function downloadModelOutput() {
  try {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      alert("PDF library not loaded (jsPDF missing).");
      return;
    }

    const doc = new jsPDF({
      orientation: "p",
      unit: "mm",
      format: [210, 400] // width, height in mm
    });

    // ============================
    // Helpers
    // ============================
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const margin = 14;
    const contentW = pageW - margin * 2;

    const LINE = 5;
    const GAP = 6;
    const BOX_PAD = 4;

    const BORDER = [210, 210, 210]; // light gray
    const TEXT = [20, 20, 20];

    function setBorder() {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.4);
    }

    function setText() {
      doc.setTextColor(...TEXT);
    }

    function ensureSpace(requiredHeight, y) {
      if (y + requiredHeight > pageH - margin) {
        doc.addPage();
        return margin;
      }
      return y;
    }

    function drawLabel(label, x, y) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(label, x, y);
      doc.setFont("helvetica", "normal");
    }

    function drawInputBox(x, y, w, h, text = "") {
      setBorder();
      doc.roundedRect(x, y, w, h, 2, 2);
      setText();
      doc.setFontSize(10);

      if (text) {
        const wrapped = doc.splitTextToSize(String(text), w - BOX_PAD * 2);
        doc.text(wrapped, x + BOX_PAD, y + BOX_PAD + 3);
      }
    }

    function drawPanel(title, x, y, w, innerLines = [], options = {}) {
      const {
        highlightLineIndex = null,
        highlightColor = [0, 128, 0], // green default
        fontSize = 10
      } = options;

      // compute height based on lines
      doc.setFontSize(fontSize);
      const lineHeights = innerLines.map(line => {
        const wrapped = doc.splitTextToSize(line, w - BOX_PAD * 2);
        return wrapped.length;
      });

      const totalLineRows = lineHeights.reduce((a, b) => a + b, 0);
      const innerH = Math.max(20, totalLineRows * LINE + BOX_PAD * 2);

      y = ensureSpace(innerH + 14, y);

      drawLabel(title, x, y);
      y += 4;

      setBorder();
      doc.roundedRect(x, y, w, innerH, 2, 2);

      let ty = y + BOX_PAD + 3;
      doc.setFontSize(fontSize);

      innerLines.forEach((line, idx) => {
        // highlight decision line
        if (highlightLineIndex === idx) {
          doc.setTextColor(...highlightColor);
          doc.setFont("helvetica", "bold");
        } else {
          setText();
          doc.setFont("helvetica", "normal");
        }

        const wrapped = doc.splitTextToSize(line, w - BOX_PAD * 2);
        doc.text(wrapped, x + BOX_PAD, ty);
        ty += wrapped.length * LINE;
      });

      setText();
      doc.setFont("helvetica", "normal");

      return y + innerH + GAP;
    }

    // ============================
    // Gather values
    // ============================
    const data = window.nslData || {};

    const projectTitle =
      data.projectTitle ||
      document.getElementById("outputProjectTitle")?.textContent ||
      "";

    const cecNumber =
      data.cecNumber ||
      document.getElementById("outputCecNumber")?.textContent ||
      "";

    const daList =
      (data.selectedActivities || []).map(a => a.code).join(", ") ||
      document.getElementById("outputDAList")?.textContent ||
      "";

    const summaryText = document.getElementById("nslSummaryContainer")?.innerText || "";
    const detailText = document.getElementById("nslDetailContainer")?.innerText || "";

    const officerDecision = document.getElementById("officerDecision")?.value || "";
    const officerSignature = document.getElementById("officerSignature")?.value || "";

    const dateStamp = document.getElementById("modelDateStamp")?.textContent || "";

    // Decide line color by decision text
    let decisionColor = [0, 128, 0]; // default green
    const decisionLower = summaryText.toLowerCase();

    // Check the most specific phrases FIRST
    if (decisionLower.includes("not required") || decisionLower.includes("not recommended")) {
      decisionColor = [0, 128, 0]; // green
    } 
    else if (decisionLower.includes("required")) {
      decisionColor = [200, 0, 0]; // red
    } 
    else if (decisionLower.includes("recommended")) {
      decisionColor = [230, 140, 0]; // orange
    }


    // Format Summary into stacked lines
    let summaryLines = summaryText
      .split(/\n+/)
      .map(s => s.trim())
      .filter(Boolean);

    // If still one long line, split using labels
    if (summaryLines.length === 1) {
      summaryLines = summaryText
        .replace(/\s+/g, " ")
        .split(/(?=NSL Index:|NSL Threshold:|Upper Bound:|Lower Bound:|NSL Index Decision:)/g)
        .map(s => s.trim())
        .filter(Boolean);
    }

    // Find the decision line index
    const decisionIndex = summaryLines.findIndex(l =>
      l.toLowerCase().startsWith("nsl index decision:")
    );

    // ============================
    // PDF Layout (match UI)
    // ============================
    let y = margin;

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("NSL Index Model Output", margin, y);
    doc.setFont("helvetica", "normal");
    y += 10;

    // Project Title
    y = ensureSpace(18, y);
    drawLabel("Project Title", margin, y);
    y += 3;
    drawInputBox(margin, y, contentW, 10, projectTitle);
    y += 14;

    // CEC Number
    y = ensureSpace(18, y);
    drawLabel("CEC Number", margin, y);
    y += 3;
    drawInputBox(margin, y, contentW, 10, cecNumber);
    y += 14;

    // DA selected
    y = ensureSpace(18, y);
    drawLabel("Designated Activities Selected", margin, y);
    y += 3;
    drawInputBox(margin, y, contentW, 10, daList);
    y += 16;

    // Summary Panel
    y = drawPanel(
      "NSL Index Summary",
      margin,
      y,
      contentW,
      summaryLines,
      {
        highlightLineIndex: decisionIndex >= 0 ? decisionIndex : null,
        highlightColor: decisionColor,
        fontSize: 9.5
      }
    );

    // Detail Panel
    const detailLines = doc
      .splitTextToSize(detailText.replace(/\s+/g, " ").trim(), contentW - BOX_PAD * 2)
      .map(l => l.trim())
      .filter(Boolean);

    y = drawPanel(
      "NSL Index Detail",
      margin,
      y,
      contentW,
      detailLines,
      { fontSize: 9.5 }
    );

    // Chart Panel
    y = ensureSpace(90, y);
    drawLabel("NSL Index Chart", margin, y);
    y += 4;

    setBorder();
    doc.roundedRect(margin, y, contentW, 78, 2, 2);

    const chartCanvas = document.getElementById("nslChart");
    if (chartCanvas) {
      const imgData = chartCanvas.toDataURL("image/png", 1.0);
      // Put image inside chart panel with padding
      doc.addImage(imgData, "PNG", margin + 3, y + 3, contentW - 6, 72);
    } else {
      doc.setFontSize(10);
      doc.text("(Chart unavailable)", margin + 4, y + 10);
    }

    y += 84;

    // Officer Decision (textarea-style box)
    y = ensureSpace(40, y);
    drawLabel("Officer Decision", margin, y);
    y += 3;
    drawInputBox(margin, y, contentW, 20, officerDecision || "");
    y += 26;

    // Officer Signature box left + Date right
    y = ensureSpace(22, y);

    drawLabel("Officer Signature", margin, y);
    y += 3;

    const sigW = 90;
    drawInputBox(margin, y, sigW, 10, officerSignature || "");

    // Date on right
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setText();
    const dateText = dateStamp || "";
    if (dateText) {
      doc.text(dateText, margin + sigW + 12, y + 8);
    }

    // Save
    doc.save("NSL_Model_Output.pdf");

  } catch (err) {
    console.error("❌ NSL PDF export failed:", err);
    alert("PDF export failed. Check console for details.");
  }
}
