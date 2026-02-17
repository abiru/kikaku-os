import { Hono } from 'hono';
import type { Env } from '../../env';
import products from './storefrontProducts';
import orders from './storefrontOrders';
import pages from './storefrontPages';
import homepage from './storefrontHomepage';

const storefront = new Hono<Env>();

storefront.route('/', products);
storefront.route('/', orders);
storefront.route('/', pages);
storefront.route('/', homepage);

export default storefront;
