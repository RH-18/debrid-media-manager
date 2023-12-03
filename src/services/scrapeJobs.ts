import axios from 'axios';
import { cleanMovieScrapes } from './movieCleaner';
import { scrapeMovies } from './movieScraper';
import { PlanetScaleCache } from './planetscale';
import { cleanTvScrapes } from './tvCleaner';
import { scrapeTv } from './tvScraper';

const tmdbKey = process.env.TMDB_KEY;
const getTmdbSearch = (imdbId: string) =>
	`https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbKey}&external_source=imdb_id`;
const mdbKey = process.env.MDBLIST_KEY;
const getMdbInfo = (imdbId: string) => `https://mdblist.com/api/?apikey=${mdbKey}&i=${imdbId}`;
const getTmdbTvInfo = (tmdbId: string) =>
	`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbKey}`;
const getTmdbMovieInfo = (tmdbId: string) =>
	`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbKey}`;

const db = new PlanetScaleCache();

function convertMdbToTmdb(apiResponse: any) {
	return {
		title: apiResponse.title,
		name: apiResponse.title,
		release_date: apiResponse.released,
		// original_title: apiResponse.original_title, // This field does not exist in the provided API response
	};
}

export type ScrapeResponse = {
	status: string;
	errorMessage?: string;
};

export async function generateScrapeJobs(imdbId: string, replaceOldScrape: boolean = false) {
	let tmdbSearch, mdbInfo;
	try {
		tmdbSearch = await axios.get(getTmdbSearch(imdbId));
		mdbInfo = await axios.get(getMdbInfo(imdbId));
	} catch (error: any) {
		console.error(error);
		return;
	}

	const isMovie = mdbInfo.data.type === 'movie' || tmdbSearch.data.movie_results?.length > 0;
	const isTv = mdbInfo.data.type === 'show' || tmdbSearch.data.tv_results?.length > 0;

	if (isMovie) {
		try {
			const tmdbId = mdbInfo.data.tmdbid ?? tmdbSearch.data.movie_results[0]?.id;
			const tmdbInfo = await axios.get(getTmdbMovieInfo(tmdbId));
			await scrapeMovies(imdbId, tmdbInfo.data, mdbInfo.data, db, replaceOldScrape);
			await cleanMovieScrapes(imdbId, tmdbInfo.data, mdbInfo.data, db);
			return;
		} catch (error: any) {
			if (error.response?.status === 404 || error.message.includes("reading 'id'")) {
				try {
					const convertedMdb = convertMdbToTmdb(mdbInfo.data);
					await scrapeMovies(imdbId, convertedMdb, mdbInfo.data, db, replaceOldScrape);
					await cleanMovieScrapes(imdbId, convertedMdb, mdbInfo.data, db);
					return;
				} catch (error: any) {
					console.error(error);
				}
			} else {
				console.error(error);
				return;
			}
		}
	}

	if (isTv) {
		try {
			const tmdbId = mdbInfo.data.tmdbid ?? tmdbSearch.data.tv_results[0]?.id;
			const tmdbInfo = await axios.get(getTmdbTvInfo(tmdbId));
			if (!replaceOldScrape) await cleanTvScrapes(imdbId, tmdbInfo.data, mdbInfo.data, db);
			await scrapeTv(imdbId, tmdbInfo.data, mdbInfo.data, db, replaceOldScrape);
			return;
		} catch (error: any) {
			if (error.response?.status === 404 || error.message.includes("reading 'id'")) {
				try {
					const convertedMdb = convertMdbToTmdb(mdbInfo.data);
					await scrapeTv(imdbId, convertedMdb, mdbInfo.data, db, replaceOldScrape);
					return;
				} catch (error: any) {
					console.error(error);
				}
			} else {
				console.error(error);
				return;
			}
		}
	}

	await db.saveScrapedResults(`movie:${imdbId}`, []);
	await db.saveScrapedResults(`tv:${imdbId}:1`, []);
	await db.markAsDone(imdbId);
	return;
}
