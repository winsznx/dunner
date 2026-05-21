import Stripe from "stripe";
import { requireEnv } from "../env";

export const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
