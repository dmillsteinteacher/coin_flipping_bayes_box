// --- Core Data Model ---
let bayesModel = [];
let history = [];
let trialCounter = 0;
let historyChart = null; // R4: Placeholder for Chart.js instance

// R3: Color Palette for History Graph (must be consistent)
const CHART_COLORS = [
    '#E67E22', '#3498DB', '#27AE60', '#8E44AD', '#C0392B', 
    '#34495E', '#1ABC9C', '#F39C12', '#2980B9', '#2C3E50' 
];

// --- Utility Functions ---

// Binomial PMF: P(k heads in N flips | p_value)
function binomialLikelihood(k, N, p) {
    // Calculates p^k * (1-p)^(N-k). We omit the combination C(N, k) as it cancels out in normalization.
    const likelihood = Math.pow(p, k) * Math.pow((1 - p), N - k);
    return likelihood;
}

// R7: P-Value Validation
function validatePValue(p) {
    return p >= 0.01 && p <= 0.99;
}

// --- Configuration Logic (R7, R2) ---

function initializeModel() {
    const countInput = document.getElementById('state-count');
    const N = parseInt(countInput.value);
    
    if (isNaN(N) || N < 2 || N > 10) {
        alert("Please enter a number of states between 2 and 10.");
        return;
    }

    bayesModel = [];
    const step = 1 / (N - 1);
    const uniformPrior = 1 / N;

    const inputsDiv = document.getElementById('hypothesis-inputs');
    inputsDiv.innerHTML = '';
    
    for (let i = 0; i < N; i++) {
        // Ensure p_value avoids 0 and 1, but covers the range
        let p_value = i * step;
        if (p_value < 0.01) p_value = 0.01;
        if (p_value > 0.99) p_value = 0.99;

        // Round to 3 decimal places
        p_value = Math.round(p_value * 1000) / 1000; 

        bayesModel.push({
            p_value: p_value,
            prior: uniformPrior,
            posterior: uniformPrior 
        });

        const groupDiv = document.createElement('div');
        groupDiv.className = 'hypothesis-group';
        
        groupDiv.innerHTML = `
            <h4>H${i+1} (p)</h4>
            <label for="p_value_${i}">P(H):</label>
            <input type="number" id="p_value_${i}" value="${p_value.toFixed(3)}" step="0.001" min="0.01" max="0.99" data-index="${i}">
            <label for="prior_${i}">Prior:</label>
            <input type="number" id="prior_${i}" value="${uniformPrior.toFixed(3)}" step="0.001" min="0" max="1" data-index="${i}">
        `;
        inputsDiv.appendChild(groupDiv);
    }
    
    document.querySelectorAll('#hypothesis-inputs input').forEach(input => {
        input.addEventListener('change', updateModelFromInput);
    });

    checkPriorSum();
    document.getElementById('start-button').disabled = false;
}

function updateModelFromInput(event) {
    const input = event.target;
    const index = parseInt(input.getAttribute('data-index'));
    let value = parseFloat(input.value);

    if (isNaN(value) || value < 0 || value > 1) {
        input.style.backgroundColor = '#fdd';
        return;
    } 

    if (input.id.startsWith('p_value')) {
        // R7: Enforce P-Value bounds
        if (!validatePValue(value)) {
            alert("P-values must be between 0.01 and 0.99.");
            input.style.backgroundColor = '#fdd';
            return;
        }
        bayesModel[index].p_value = value;
    } else if (input.id.startsWith('prior')) {
        bayesModel[index].prior = value;
    }
    input.style.backgroundColor = '';
    checkPriorSum();
}

function checkPriorSum() {
    const sum = bayesModel.reduce((acc, h) => acc + h.prior, 0);
    const message = document.getElementById('prior-sum-message');
    const startButton = document.getElementById('start-button');
    
    message.textContent = `Current Prior Sum: ${sum.toFixed(3)}`;
    
    if (Math.abs(sum - 1.0) < 0.001) {
        message.style.color = 'green';
        startButton.disabled = false;
    } else {
        message.style.color = 'red';
        startButton.disabled = true;
    }
}

function normalizePriors() {
    const sum = bayesModel.reduce((acc, h) => acc + h.prior, 0);
    if (sum === 0) {
        alert("Cannot normalize: sum of priors is zero.");
        return;
    }

    bayesModel.forEach((h, index) => {
        h.prior = h.prior / sum;
        document.getElementById(`prior_${index}`).value = h.prior.toFixed(3);
    });
    checkPriorSum();
}

function startSimulation() {
    if (bayesModel.length === 0) {
        alert("Please set up the hypotheses first.");
        return;
    }
    // R1: Clear history and reset counter for a new simulation
    history = [];
    trialCounter = 0;
    
    // Set initial visualization
    renderVisualization(bayesModel.map(h => ({ value: h.prior, p_value: h.p_value })), 'prior-visualization');
    renderVisualization([], 'posterior-visualization'); 
    
    // Enable Update Tab and switch view
    document.getElementById('update-tab').disabled = false;
    document.getElementById('history-tab').disabled = false;
    showTab('update');
}

// --- Visualization Logic ---

function renderVisualization(data, elementId) {
    const container = document.getElementById(elementId);
    container.innerHTML = '';
    
    const maxBarHeight = 300;
    const barWidthPercent = 100 / data.length;
    
    data.forEach(item => {
        const height = item.value * maxBarHeight;
        
        const box = document.createElement('div');
        box.className = 'bayes-box';
        box.style.height = `${height}px`;
        box.style.width = `${barWidthPercent - 1}%`; 
        
        const valueLabel = document.createElement('div');
        valueLabel.className = 'box-value';
        // Only show value if height is visible (helps prevent clutter)
        valueLabel.textContent = item.value.toFixed(3); 
        
        const pLabel = document.createElement('div');
        pLabel.className = 'box-label';
        pLabel.textContent = `p=${item.p_value}`;

        box.appendChild(valueLabel);
        container.appendChild(box);
        container.appendChild(pLabel); // Label outside the box for better layout
    });
}

// --- Update Logic (R1, R5, R6) ---

function performUpdate() {
    const N = parseInt(document.getElementById('flips-input').value);
    const k = parseInt(document.getElementById('heads-input').value);
    const warningEl = document.getElementById('input-warning');

    // R6: Input validation
    if (isNaN(N) || N <= 0 || isNaN(k) || k < 0 || k > N || N > 100) {
        warningEl.textContent = "Invalid input. N must be 1-100, and k must be between 0 and N.";
        return;
    } else {
        warningEl.textContent = "";
    }
    
    // R1: AUTOMATIC ITERATION (Posterior becomes the new Prior)
    if (trialCounter > 0) {
        bayesModel.forEach(h => {
            h.prior = h.posterior;
        });
    }

    // 1. Calculate Unnormalized Posterior
    let totalProbability = 0; // P(Data)

    bayesModel.forEach(h => {
        const likelihood = binomialLikelihood(k, N, h.p_value);
        h.unnormalizedPosterior = likelihood * h.prior;
        totalProbability += h.unnormalizedPosterior;
    });

    // R5: Underflow Fix: Only halt if total probability is exactly zero
    if (totalProbability === 0) {
        alert("The data is impossible given the current set of hypotheses (Total Probability is zero). Update halted.");
        return;
    }

    // 2. Calculate Final Posterior and Prepare History Record
    const currentPosteriorData = [];
    
    bayesModel.forEach(h => {
        h.posterior = h.unnormalizedPosterior / totalProbability;
        currentPosteriorData.push({ value: h.posterior, p_value: h.p_value });
    });

    // 3. Render Visualization
    renderVisualization(bayesModel.map(h => ({ value: h.prior, p_value: h.p_value })), 'prior-visualization');
    renderVisualization(currentPosteriorData, 'posterior-visualization');
    
    // R2: Visual Feedback (Flash effect)
    const priorViz = document.getElementById('prior-visualization');
    const posteriorViz = document.getElementById('posterior-visualization');

    priorViz.classList.add('updated');
    posteriorViz.classList.add('updated');
    
    setTimeout(() => {
        priorViz.classList.remove('updated');
        posteriorViz.classList.remove('updated');
    }, 500);

    // 4. Save History (R4)
    trialCounter++;
    const historyRecord = {
        trial: trialCounter,
        N: N,
        k: k,
        posterior: bayesModel.map(h => h.posterior),
        p_values: bayesModel.map(h => h.p_value) 
    };
    history.push(historyRecord);

    // 5. Update History Views
    updateHistoryViews();
}

// --- History Logic (R4) ---
function updateHistoryViews() {
    if (history.length === 0) return;
    
    // R4: Update Chart.js Graph
    renderHistoryChart();

    // Update Table (R4 - Tabular View)
    const tableBody = document.querySelector('#history-table tbody');
    const tableHeadRow = document.querySelector('#history-table thead tr');

    // Re-generate headers on first run in case configuration changed
    if (history.length === 1) {
        tableHeadRow.innerHTML = `<th>Trial</th><th>N</th><th>k</th>`;
        history[0].p_values.forEach(p => {
            tableHeadRow.innerHTML += `<th>P(H:p=${p.toFixed(3)})</th>`;
        });
        tableBody.innerHTML = ''; // Clear existing rows
    }

    // Add the latest row
    const latestRecord = history[history.length - 1];
    const newRow = tableBody.insertRow();
    
    newRow.insertCell().textContent = latestRecord.trial;
    newRow.insertCell().textContent = latestRecord.N;
    newRow.insertCell().textContent = latestRecord.k;
    
    latestRecord.posterior.forEach(p => {
        newRow.insertCell().textContent = p.toFixed(4);
    });
}

// R4: Chart.js Implementation for Line Graph
function renderHistoryChart() {
    const ctx = document.getElementById('history-chart').getContext('2d');
    const p_values = history[0].p_values;
    const trialLabels = history.map(r => r.trial);

    // Prepare datasets for Chart.js
    const datasets = p_values.map((p_value, pIndex) => {
        const color = CHART_COLORS[pIndex % CHART_COLORS.length];
        return {
            label: `p = ${p_value.toFixed(3)}`, // R3: Legend label
            data: history.map(r => r.posterior[pIndex]),
            borderColor: color,
            backgroundColor: color,
            fill: false,
            tension: 0, // Straight lines between points
            pointRadius: 4,
            pointHoverRadius: 6,
        };
    });

    if (historyChart) {
        // If chart exists, update data
        historyChart.data.labels = trialLabels;
        historyChart.data.datasets = datasets;
        historyChart.update();
    } else {
        // Create new chart instance
        historyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: trialLabels,
                datasets: datasets,
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Evolution of Posterior Probabilities',
                    },
                    legend: {
                        display: true, // R3: Show the legend
                        position: 'bottom',
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Trial Number'
                        },
                        // Ensure X-axis shows integers starting at 1
                        ticks: {
                            stepSize: 1,
                            callback: function(val, index) {
                                return val % 1 === 0 ? val : '';
                            }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Posterior Probability'
                        },
                        min: 0,
                        max: 1,
                        ticks: {
                            stepSize: 0.1,
                            callback: function(value) {
                                return value.toFixed(1);
                            }
                        }
                    }
                }
            }
        });
    }
}


// --- Tab Switching Logic ---
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(el => {
        el.classList.remove('active');
    });

    document.getElementById(tabId).classList.add('active');
    document.querySelector(`.tab-button[onclick="showTab('${tabId}')"]`).classList.add('active');
    
    // R4: Ensure chart renders/updates when history tab is shown
    if (tabId === 'history' && history.length > 0) {
        // Must wait for DOM elements to fully render Chart.js
        setTimeout(renderHistoryChart, 10); 
    }
}

// --- Initial Setup ---
window.onload = () => {
    initializeModel(); // Set up the default 5 states on load
};