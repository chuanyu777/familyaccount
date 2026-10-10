# 家庭记账簿 Agent Runtime（LangChain）镜像
# 与 backend/ 的 Spring Boot 服务同属一个 compose 网络，通过服务名互访。

FROM python:3.13-slim

WORKDIR /app

# 国内 pip 源；海外构建可用 --build-arg PIP_INDEX_URL=https://pypi.org/simple
ARG PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple/

COPY requirements.txt ./
RUN pip install --no-cache-dir -i "$PIP_INDEX_URL" -r requirements.txt

COPY app ./app

EXPOSE 8090

# uvicorn 不支持 h2c 升级，而后端 JDK HttpClient 默认会对 http:// 发 Upgrade，
# 会造成请求体丢失（FastAPI 报 422）。固定用 h11 解析器更稳。
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090", "--http", "h11"]
