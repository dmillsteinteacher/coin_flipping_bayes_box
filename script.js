// --- Core Data Model ---
let bayesModel = [];
let history = [];
let trialCounter = 0;

// --- Helper Functions ---

// Binomial Coefficient C(n, k) - Not strictly needed since we normalize,
// but included for mathematical completeness and understanding.
function combinations(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    if (k > n / 2) k = n - k;
    let res = 1;
    for (let i = 1; i <= k; i++) {
        res = res * (n - i + 1) / i;
    }
    return res;
}

// Binomial PMF: P(k heads in N flips | p_value)
function binomialLikelihood(k, N, p) {
    // P(Data | Hypothesis) = C(N, k) * p^k * (1-p)^(N-k)
    // We only need the relative likelihoods for the update, so we can ignore C(N, k)
    // as it is the same for all hypotheses and will cancel out during normalization.
    // However, including it provides better numerical stability in edge cases.
    
    // For simplicity with basic JS, we will focus on p^k * (1-p)^(N-k)
    // and let the normalization step handle the rest.
    
    // Note: When N=1, k=1 -> p. When N=1, k=0 -> (1-p).
    
    const likelihood = Math.pow(p, k) * Math.pow((1 - p), N - k);
    return likelihood;
}

// --- Configuration Logic (R2) ---

function initializeModel() {
    const countInput = document.getElementById('state-count');
    const N = parseInt(countInput.value);
    
    if (isNaN(N) || N < 2 || N > 10) {
        alert("Please enter a number of states between 2 and 10.");
        return;
    }

    // Default Initialization: Evenly spaced p-values, uniform priors
    bayesModel = [];
    const step = 1 / (N - 1);
    const uniformPrior = 1 / N;

    const inputsDiv = document.getElementById('hypothesis-inputs');
    inputsDiv.innerHTML = '';
    
    for (let i = 0; i < N; i++) {
        const p_value = Math.round(i * step * 1000) / 1000; // Round to 3 decimal places
        
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
            <input type="number" id="p_value_${i}" value="${p_value.toFixed(3)}" step="0.001" min="0" max="1" data-index="${i}">
            <label for="prior_${i}">Prior:</label>
            <input type="number" id="prior_${i}" value="${uniformPrior.toFixed(3)}" step="0.001" min="0" max="1" data-index="${i}">
        `;
        inputsDiv.appendChild(groupDiv);
    }
    
    // Attach event listeners to update model on input change
    document.querySelectorAll('#hypothesis-inputs input').forEach(input => {
        input.addEventListener('change', updateModelFromInput);
    });

    // Check sum of priors
    checkPriorSum();
    document.getElementById('start-button').disabled = false;
}

function updateModelFromInput(event) {
    const input = event.target;
    const index = parseInt(input.getAttribute('data-index'));
    const value = parseFloat(input.value);

    if (isNaN(value) || value < 0 || value > 1) {
        // Simple error handling
        input.style.backgroundColor = '#fdd';
        return;
    } else {
        input.style.backgroundColor = '';
    }

    if (input.id.startsWith('p_value')) {
        bayesModel[index].p_value = value;
    } else if (input.id.startsWith('prior')) {
        bayesModel[index].prior = value;
    }
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
    // Set initial visualization
    renderVisualization(bayesModel.map(h => ({ value: h.prior, p_value: h.p_value })), 'prior-visualization');
    renderVisualization([], 'posterior-visualization'); // Clear posterior initially
    
    // Enable Update Tab and switch view
    document.getElementById('update-tab').disabled = false;
    document.getElementById('history-tab').disabled = false;
    showTab('update');
}

// --- Visualization Logic (R3) ---

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
        box.style.width = `${barWidthPercent - 1}%`; // -1 for a slight gap
        
        // Add a label inside showing the probability
        const valueLabel = document.createElement('div');
        valueLabel.className = 'box-value';
        valueLabel.textContent = item.value.toFixed(3);
        
        // Add a label underneath showing the p_value (Hypothesis)
        const pLabel = document.createElement('div');
        pLabel.className = 'box-label';
        pLabel.textContent = `p=${item.p_value}`;

        box.appendChild(valueLabel);
        box.appendChild(pLabel);
        container.appendChild(box);
    });
}

// --- Update Logic (R3) ---

function performUpdate() {
    const N = parseInt(document.getElementById('flips-input').value);
    const k = parseInt(document.getElementById('heads-input').value);

    if (isNaN(N) || N <= 0 || isNaN(k) || k < 0 || k > N) {
        alert("Invalid input: N must be > 0, and k must be between 0 and N.");
        return;
    }

    // 1. Calculate Unnormalized Posterior
    let totalProbability = 0; // P(Data) = Sum(P(Data|H_i) * P(H_i))

    bayesModel.forEach(h => {
        // Likelihood: P(Data | H_i)
        const likelihood = binomialLikelihood(k, N, h.p_value);
        
        // Unnormalized Posterior: P(Data | H_i) * P(H_i)
        h.unnormalizedPosterior = likelihood * h.prior;
        
        totalProbability += h.unnormalizedPosterior;
    });

    // Handle case where total probability is near zero (highly improbable data given priors)
    if (totalProbability < 1e-10) {
        alert("The data is extremely improbable given the current priors. Update halted.");
        return;
    }

    // 2. Calculate Final Posterior and Prepare History Record
    const currentPosteriorData = [];
    const currentPriorData = [];

    bayesModel.forEach(h => {
        // Posterior: (Unnormalized Posterior) / P(Data)
        h.posterior = h.unnormalizedPosterior / totalProbability;
        
        currentPosteriorData.push({ value: h.posterior, p_value: h.p_value });
        currentPriorData.push({ value: h.prior, p_value: h.p_value });
    });

    // 3. Render Visualization
    renderVisualization(currentPriorData, 'prior-visualization');
    renderVisualization(currentPosteriorData, 'posterior-visualization');
    
    // 4. Save History (R4)
    trialCounter++;
    const historyRecord = {
        trial: trialCounter,
        N: N,
        k: k,
        prior: bayesModel.map(h => h.prior),
        posterior: bayesModel.map(h => h.posterior),
        p_values: bayesModel.map(h => h.p_value) // Store p_values with the record
    };
    history.push(historyRecord);

    // 5. Update UI
    document.getElementById('iterate-button').disabled = false;
    updateHistoryViews();
}

function usePosteriorAsPrior() {
    // 1. Update the core model: Posterior becomes the new Prior
    bayesModel.forEach(h => {
        h.prior = h.posterior;
    });
    
    // 2. Update the visualization to show the new prior (old posterior)
    renderVisualization(bayesModel.map(h => ({ value: h.prior, p_value: h.p_value })), 'prior-visualization');
    renderVisualization([], 'posterior-visualization'); // Clear posterior
    
    // 3. Clear inputs and disable iterate button
    document.getElementById('flips-input').value = 1;
    document.getElementById('heads-input').value = 0;
    document.getElementById('iterate-button').disabled = true;
}

// --- History Logic (R4) ---

function updateHistoryViews() {
    if (history.length === 0) return;
    
    // 1. Update Table (R4 - Tabular View)
    const tableBody = document.querySelector('#history-table tbody');
    const tableHeadRow = document.querySelector('#history-table thead tr');

    // Re-generate headers on first run in case configuration changed
    if (history.length === 1) {
        tableHeadRow.innerHTML = `<th>Trial</th><th>N</th><th>k</th>`;
        history[0].p_values.forEach((p, i) => {
            tableHeadRow.innerHTML += `<th>P(H:p=${p.toFixed(2)})</th>`;
        });
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
    
    // 2. Update Graph (R4 - Visual Evolution)
    renderHistoryGraph();
}

// Simple DOM-based Line Graph (R4 - Visual Evolution)
// Note: This is a highly simplified rendering using only divs/styles.
function renderHistoryGraph() {
    const graphArea = document.getElementById('history-graph-area');
    graphArea.innerHTML = '';

    if (history.length === 0) return;
    
    const container = document.createElement('div');
    container.className = 'line-chart-container';
    graphArea.appendChild(container);

    const width = graphArea.clientWidth;
    const height = graphArea.clientHeight;
    const maxTrial = history.length;
    
    // Use a color palette for the lines (can be expanded)
    const colors = [
        '#E67E22', // Orange (Low P)
        '#3498DB', // Blue (Mid-Low P)
        '#27AE60', // Green (Fair P)
        '#8E44AD', // Purple (Mid-High P)
        '#C0392B', // Red (High P)
        '#34495E', '#1ABC9C', '#F39C12', '#2980B9', '#2C3E50' // Additional colors
    ];
    
    // Group history data by p_value
    const p_values = history[0].p_values;
    const historyByPValue = p_values.map((p, pIndex) => ({
        p_value: p,
        points: history.map((record, tIndex) => ({
            x: tIndex + 1, // Trial number
            y: record.posterior[pIndex] // Posterior probability
        }))
    }));

    // Render Y-Axis labels (0.0, 0.5, 1.0)
    [0, 0.5, 1.0].forEach(val => {
        const yPos = height * (1 - val);
        const label = document.createElement('div');
        label.className = 'y-axis-label';
        label.style.top = `${yPos}px`;
        label.textContent = val.toFixed(1);
        container.appendChild(label);
    });

    // Render the lines
    historyByPValue.forEach((series, pIndex) => {
        const color = colors[pIndex % colors.length];
        
        series.points.forEach((point, i) => {
            if (i < series.points.length - 1) {
                const nextPoint = series.points[i+1];
                
                // Scale coordinates
                const x1 = (point.x / maxTrial) * width;
                const y1 = (1 - point.y) * height;
                const x2 = (nextPoint.x / maxTrial) * width;
                const y2 = (1 - nextPoint.y) * height;

                // Simple line segment rendering (requires CSS transforms for rotation, which is complex in pure JS/DOM)
                // We will use circles/points for simplicity and clarity instead of complicated line segments for this simple app.
                
                // Render points and connect them conceptually.
                const pointEl = document.createElement('div');
                pointEl.className = 'line-chart-point';
                pointEl.style.backgroundColor = color;
                pointEl.style.left = `${x1}px`;
                pointEl.style.top = `${y1}px`;
                pointEl.title = `Trial ${point.x}: p=${series.p_value} -> ${point.y.toFixed(4)}`;
                container.appendChild(pointEl);
            }
        });
        
        // Render the last point
        const lastPoint = series.points[series.points.length - 1];
        const x_last = (lastPoint.x / maxTrial) * width;
        const y_last = (1 - lastPoint.y) * height;
        const lastPointEl = document.createElement('div');
        lastPointEl.className = 'line-chart-point';
        lastPointEl.style.backgroundColor = color;
        lastPointEl.style.left = `${x_last}px`;
        lastPointEl.style.top = `${y_last}px`;
        lastPointEl.title = `Trial ${lastPoint.x}: p=${series.p_value} -> ${lastPoint.y.toFixed(4)}`;
        container.appendChild(lastPointEl);
    });
}

// --- Tab Switching Logic ---
function showTab(tabId) {
    // Hide all tab content
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
    });
    // Deactivate all buttons
    document.querySelectorAll('.tab-button').forEach(el => {
        el.classList.remove('active');
    });

    // Show the selected tab content
    document.getElementById(tabId).classList.add('active');
    // Activate the corresponding button
    document.querySelector(`.tab-button[onclick="showTab('${tabId}')"]`).classList.add('active');
    
    // Re-render the graph when history tab is shown
    if (tabId === 'history') {
        renderHistoryGraph();
    }
}

// --- Initial Setup ---
window.onload = () => {
    initializeModel(); // Set up the default 5 states on load
};