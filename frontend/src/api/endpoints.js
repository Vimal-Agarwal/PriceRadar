import api from "./client";

export const authApi = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
};

export const productsApi = {
  list: () => api.get("/products"),
  get: (id) => api.get(`/products/${id}`),
  create: (data) => api.post("/products", data),
  update: (id, data) => api.put(`/products/${id}`, data),
  remove: (id) => api.delete(`/products/${id}`),
  history: (id, period = "all") =>
    api.get(`/products/${id}/history`, { params: { period } }),
  runNow: () => api.post("/admin/run-now"),
};
