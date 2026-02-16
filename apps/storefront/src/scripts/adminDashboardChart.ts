async function initChart() {
	const { default: Chart } = await import('chart.js/auto');
	const dataElement = document.getElementById('analytics-data');
	const chartData = dataElement ? JSON.parse(dataElement.textContent || 'null') : null;

	if (!chartData || !chartData.dailySales || chartData.dailySales.length === 0) {
		return; // No data to display
	}

	const salesCtx = document.getElementById('salesChart') as HTMLCanvasElement | null;

	// If canvas doesn't exist yet (React still loading), retry
	if (!salesCtx) {
		setTimeout(initChart, 100);
		return;
	}

	const labels = chartData.dailySales.map((d: { date: string }) => {
		const date = new Date(d.date);
		return `${date.getMonth() + 1}/${date.getDate()}`;
	});
	const revenues = chartData.dailySales.map((d: { revenue: number }) => d.revenue);
	const orders = chartData.dailySales.map((d: { orders: number }) => d.orders);

	new Chart(salesCtx, {
		type: 'bar',
		data: {
			labels,
			datasets: [
				{
					type: 'line',
					label: 'Revenue',
					data: revenues,
					borderColor: 'rgb(79, 70, 229)',
					backgroundColor: 'rgba(79, 70, 229, 0.1)',
					fill: true,
					tension: 0.3,
					yAxisID: 'y'
				},
				{
					type: 'bar',
					label: 'Orders',
					data: orders,
					backgroundColor: 'rgba(16, 185, 129, 0.8)',
					borderColor: 'rgb(16, 185, 129)',
					borderWidth: 1,
					yAxisID: 'y1'
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: {
				mode: 'index',
				intersect: false
			},
			plugins: {
				legend: {
					display: false
				},
				tooltip: {
					callbacks: {
						label: (context) => {
							const value = context.raw as number;
							if (context.dataset.label === 'Revenue') {
								return `Revenue: ${new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value)}`;
							}
							return `Orders: ${value}`;
						}
					}
				}
			},
			scales: {
				y: {
					type: 'linear',
					display: true,
					position: 'left',
					beginAtZero: true,
					ticks: {
						callback: (value) => {
							const numValue = Number(value);
							if (numValue >= 10000) {
								return `${numValue / 10000}万`;
							}
							return numValue.toLocaleString();
						}
					},
					grid: {
						color: 'rgba(0, 0, 0, 0.05)'
					}
				},
				y1: {
					type: 'linear',
					display: true,
					position: 'right',
					beginAtZero: true,
					ticks: {
						stepSize: 1
					},
					grid: {
						drawOnChartArea: false
					}
				},
				x: {
					grid: {
						display: false
					}
				}
			}
		}
	});
}

// Start initialization
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initChart);
} else {
	initChart();
}
