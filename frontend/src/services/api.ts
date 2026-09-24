import axios from "axios";

export const api = axios.create({
  baseURL: "/api/v1",
  timeout: 4000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor — will add JWT token in Sprint 4
api.interceptors.request.use(
  (config) => {
    // const token = localStorage.getItem("access_token");
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — will handle 401 refresh in Sprint 4
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // if (error.response?.status === 401) {
    //   // Handle token refresh
    // }
    return Promise.reject(error);
  }
);
