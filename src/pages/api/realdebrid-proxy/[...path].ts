import axios, { AxiosRequestConfig, Method } from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';

const REAL_DEBRID_BASE_URL = 'https://api.real-debrid.com';

function buildTargetUrl(req: NextApiRequest, pathSegments: string[]): string {
	const filteredQuery = { ...req.query } as Record<string, string | string[]>;
	delete filteredQuery.path;

	const searchParams = new URLSearchParams();
	Object.entries(filteredQuery).forEach(([key, value]) => {
		if (Array.isArray(value)) {
			value.forEach((item) => searchParams.append(key, item));
		} else if (value !== undefined) {
			searchParams.append(key, value);
		}
	});

	const normalizedPath = pathSegments.join('/');
	const queryString = searchParams.toString();

	const targetPath = normalizedPath ? `/${normalizedPath}` : '';
	return `${REAL_DEBRID_BASE_URL}${targetPath}${queryString ? `?${queryString}` : ''}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const pathParam = req.query.path;
	const pathSegments = Array.isArray(pathParam)
		? pathParam
		: typeof pathParam === 'string'
			? [pathParam]
			: [];
	const url = buildTargetUrl(req, pathSegments);

	const headers: AxiosRequestConfig['headers'] = {};
	if (req.headers.authorization) {
		headers['Authorization'] = req.headers.authorization;
	}
	if (req.headers['content-type']) {
		headers['Content-Type'] = req.headers['content-type'];
	}

	const config: AxiosRequestConfig = {
		method: (req.method || 'GET') as Method,
		url,
		headers,
		data: req.method && ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
		validateStatus: () => true,
	};

	try {
		const response = await axios.request(config);

		Object.entries(response.headers).forEach(([key, value]) => {
			if (typeof value === 'undefined') {
				return;
			}

			if (key.toLowerCase() === 'content-length') {
				return;
			}

			if (Array.isArray(value)) {
				res.setHeader(key, value.join(','));
			} else {
				res.setHeader(key, value);
			}
		});

		res.status(response.status).send(response.data);
	} catch (error: any) {
		console.error('RealDebrid proxy error:', error.message || error);
		res.status(500).json({ error: 'Failed to reach Real-Debrid API' });
	}
}
