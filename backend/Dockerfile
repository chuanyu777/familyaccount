# 家庭记账簿后端镜像：多阶段构建，产出可直接运行的 Spring Boot jar
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml ./
COPY mvn-settings.xml ./
# 先只拉依赖（利用 Docker 层缓存）
RUN mvn -s mvn-settings.xml -q dependency:go-offline
COPY src ./src
RUN mvn -s mvn-settings.xml -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /build/target/family-ledger.jar app.jar
EXPOSE 3001
ENTRYPOINT ["java", "-jar", "app.jar"]
