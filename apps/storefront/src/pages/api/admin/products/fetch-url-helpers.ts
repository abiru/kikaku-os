/**
 * Helper functions for fetch-url endpoint
 * Handles HTML meta extraction, image extraction, spec parsing,
 * brand detection, and Japanese content generation.
 */

export type FetchResult = {
	success: boolean;
	image_url?: string;
	original_title?: string;
	original_description?: string;
	generated_title?: string;
	generated_description?: string;
	specs?: Record<string, string>;
	source?: string;
	error?: string;
	warning?: string;
};

export const extractMetaTags = (html: string): Record<string, string> => {
	const meta: Record<string, string> = {};

	// og:image
	const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
		|| html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
	if (ogImageMatch && ogImageMatch[1]) meta.ogImage = ogImageMatch[1];

	// og:title
	const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
		|| html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
	if (ogTitleMatch && ogTitleMatch[1]) meta.ogTitle = ogTitleMatch[1];

	// og:description
	const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
		|| html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
	if (ogDescMatch && ogDescMatch[1]) meta.ogDescription = ogDescMatch[1];

	// description
	const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
		|| html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
	if (descMatch && descMatch[1]) meta.description = descMatch[1];

	// title tag
	const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
	if (titleMatch && titleMatch[1]) meta.title = titleMatch[1].trim();

	return meta;
};

export const extractMainImage = (html: string, baseUrl: string): string | null => {
	// Try product image patterns
	const patterns = [
		// WordPress/WooCommerce
		/<img[^>]+class=["'][^"']*wp-post-image[^"']*["'][^>]+src=["']([^"']+)["']/i,
		// Common product image classes
		/<img[^>]+class=["'][^"']*product[^"']*image[^"']*["'][^>]+src=["']([^"']+)["']/i,
		// data-src for lazy loading
		/<img[^>]+data-src=["']([^"']+(?:\.jpg|\.jpeg|\.png|\.webp)[^"']*)["']/i,
		// srcset first image
		/<img[^>]+srcset=["']([^\s"']+)/i,
		// First large image
		/<img[^>]+src=["']([^"']+(?:\.jpg|\.jpeg|\.png|\.webp)[^"']*)["'][^>]+(?:width|height)=["']?[4-9]\d{2,}/i,
		// Any product-related image
		/<img[^>]+src=["']([^"']*product[^"']*(?:\.jpg|\.jpeg|\.png|\.webp)[^"']*)["']/i,
	];

	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (match && match[1]) {
			let url = match[1];
			if (url.startsWith('//')) {
				url = 'https:' + url;
			} else if (url.startsWith('/')) {
				const base = new URL(baseUrl);
				url = `${base.protocol}//${base.host}${url}`;
			}
			return url;
		}
	}

	return null;
};

export const extractSpecs = (html: string): Record<string, string> => {
	const specs: Record<string, string> = {};

	// Power/Wattage
	const powerMatch = html.match(/(?:消費電力|Power|Wattage|Actual\s*Power)[:\s]*(\d+)\s*[Ww]/i);
	if (powerMatch && powerMatch[1]) specs.power = `${powerMatch[1]}W`;

	// PPE/Efficacy
	const ppeMatch = html.match(/(?:PPE|Efficacy)[:\s]*([\d.]+)\s*(?:μmol\/J|umol\/J)/i);
	if (ppeMatch && ppeMatch[1]) specs.ppe = `${ppeMatch[1]} μmol/J`;

	// PPF
	const ppfMatch = html.match(/(?:PPF)[:\s]*([\d.]+)\s*(?:μmol\/S|umol\/S|μmol\/s)/i);
	if (ppfMatch && ppfMatch[1]) specs.ppf = `${ppfMatch[1]} μmol/S`;

	// Coverage - various formats
	const coverageMatch = html.match(/(?:Coverage|カバレッジ|Flower(?:ing)?\s*Coverage)[:\s]*([\d.]+)\s*[x×]\s*([\d.]+)\s*(ft|m|cm)/i);
	if (coverageMatch && coverageMatch[1] && coverageMatch[2] && coverageMatch[3]) specs.coverage = `${coverageMatch[1]}x${coverageMatch[2]} ${coverageMatch[3]}`;

	// LED chip info
	const ledMatch = html.match(/(Samsung\s*LM301[A-Z]*(?:\s*EVO)?|Bridgelux|Osram|Epistar)/i);
	if (ledMatch && ledMatch[1]) specs.led = ledMatch[1];

	// LED count
	const ledCountMatch = html.match(/(\d+)\s*(?:pcs|pieces|個)?\s*(?:LEDs?|ダイオード|diodes)/i);
	if (ledCountMatch && ledCountMatch[1]) specs.led_count = `${ledCountMatch[1]}個`;

	// Spectrum
	const spectrumMatch = html.match(/(?:Full\s*Spectrum|フルスペクトラム|Spectrum)[:\s]*([^<\n]+)/i);
	if (spectrumMatch && spectrumMatch[1] && spectrumMatch[1].length < 100) specs.spectrum = spectrumMatch[1].trim();

	return specs;
};

export const extractBrandFromUrl = (url: string): string => {
	const urlMatch = url.match(/(?:www\.)?([^.]+)\./i);
	if (urlMatch && urlMatch[1]) {
		const domain = urlMatch[1].toLowerCase();
		if (domain.includes('mars')) return 'Mars Hydro';
		if (domain.includes('spider')) return 'Spider Farmer';
		if (domain.includes('viparspectra')) return 'VIPARSPECTRA';
		if (domain.includes('gavita')) return 'Gavita';
		if (domain.includes('hlg') || domain.includes('horticulture')) return 'HLG';
	}
	return '';
};

export const extractBrand = (html: string, url: string): string => {
	const brandFromUrl = extractBrandFromUrl(url);
	if (brandFromUrl) return brandFromUrl;

	const brandPatterns = [
		/Mars\s*Hydro/i,
		/Spider\s*Farmer/i,
		/VIPARSPECTRA/i,
		/Gavita/i,
		/HLG|Horticulture\s*Lighting\s*Group/i,
	];

	for (const pattern of brandPatterns) {
		const match = html.match(pattern);
		if (match) return match[0];
	}

	return '';
};

export const generateJapaneseTitle = (originalTitle: string, brand: string, specs: Record<string, string>): string => {
	const modelMatch = originalTitle.match(/([A-Z]{2,}[-\s]?\d{3,}[A-Z]*)/i);
	const model = modelMatch && modelMatch[1] ? modelMatch[1].toUpperCase() : '';

	let title = '';
	if (brand) title += `【${brand}】`;
	if (model) title += `${model} `;
	if (specs.power) title += `${specs.power} `;

	title += 'LEDグロウライト';

	if (specs.led && specs.led.includes('Samsung')) {
		title += ' Samsung LED搭載';
	}

	title += ' | 植物育成ライト フルスペクトラム';

	return title;
};

export const generateJapaneseDescriptionMarkdown = (
	originalTitle: string,
	brand: string,
	specs: Record<string, string>,
	_originalDesc: string
): string => {
	let md = `## ${originalTitle}\n\n`;

	const brandText = brand || 'プレミアム';
	md += `**プロも認める高効率フルスペクトラムLED** - 室内栽培のパフォーマンスを最大化する${brandText}の最新グロウライト。苗から開花まで、すべての成長段階を強力にサポートします。\n\n`;

	const specsList: string[] = [];
	if (specs.power) specsList.push(`- **消費電力:** ${specs.power}`);
	if (specs.ppf) specsList.push(`- **光量子束(PPF):** ${specs.ppf}`);
	if (specs.ppe) specsList.push(`- **効率(PPE):** ${specs.ppe}`);
	if (specs.coverage) specsList.push(`- **カバレッジ:** ${specs.coverage}`);
	if (specs.led) specsList.push(`- **LEDチップ:** ${specs.led}`);
	if (specs.led_count) specsList.push(`- **LED数:** ${specs.led_count}`);

	if (specsList.length > 0) {
		md += `### 主要スペック\n\n${specsList.join('\n')}\n\n`;
	}

	md += `### 特徴\n\n`;
	md += `- **フルスペクトラム:** 自然光に近い光スペクトルで、すべての成長段階に対応\n`;
	md += `- **高効率設計:** 従来のHPSライトと比較して電気代を大幅削減\n`;
	md += `- **静音設計:** パッシブ冷却採用で静かな栽培環境を実現\n`;
	md += `- **調光機能:** 植物の成長段階に合わせて光量を調整可能\n\n`;

	md += `初心者からプロまで、確かな品質と性能で室内栽培を成功に導きます。`;

	return md;
};
