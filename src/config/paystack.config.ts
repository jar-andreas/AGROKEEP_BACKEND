import axios, { AxiosInstance } from "axios";
import { env } from "./keys.js";
import logger from "./logger.js";

const PAYSTACK_SECRET_KEY = env.PAYSTACK_SECRET_KEY;

const PAYSTACK_BASE_URL = "https://api.paystack.co";

//change "any" to "AxiosInstance" for better developer experience... this will give you autocomplete intellisense when you use the getPaystack() function in your controllers

let paystackInstance: AxiosInstance | null = null;

export const getPaystack = (): AxiosInstance => {
  if (!paystackInstance) {
    const secret = PAYSTACK_SECRET_KEY;
    if (!secret) {
      throw new Error(
        "PAYSTACK_SECRET_KEY is not defined. Please include it in your .env file",
      );
    }
    logger.info("Paystack key configured");
    paystackInstance = axios.create({
      baseURL: PAYSTACK_BASE_URL,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });
  }
  return paystackInstance;
};
