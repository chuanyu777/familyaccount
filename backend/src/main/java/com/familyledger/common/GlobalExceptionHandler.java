package com.familyledger.common;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** 统一错误处理：把异常收敛成 { error: { code, message } }，与前端契约一致。 */
@RestControllerAdvice
public class GlobalExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Map<String, Object>> handleApi(ApiException e) {
    return ResponseEntity.status(e.getStatus()).body(error(e.getCode(), e.getMessage()));
  }

  @ExceptionHandler({ HttpMessageNotReadableException.class })
  public ResponseEntity<Map<String, Object>> handleUnreadable(HttpMessageNotReadableException e) {
    return ResponseEntity.badRequest().body(error("VALIDATION_FAILED", "请求体不是合法的 JSON"));
  }

  @ExceptionHandler({ MissingServletRequestParameterException.class })
  public ResponseEntity<Map<String, Object>> handleMissingParam(MissingServletRequestParameterException e) {
    return ResponseEntity.badRequest().body(error("VALIDATION_FAILED", "缺少必填参数"));
  }

  @ExceptionHandler({ MethodArgumentTypeMismatchException.class })
  public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
    return ResponseEntity.badRequest().body(error("VALIDATION_FAILED", "参数格式非法"));
  }

  @ExceptionHandler({ HttpRequestMethodNotSupportedException.class })
  public ResponseEntity<Map<String, Object>> handleMethod(HttpRequestMethodNotSupportedException e) {
    return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
        .body(error("METHOD_NOT_ALLOWED", "请求方法不支持"));
  }

  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<Map<String, Object>> handleNoResource(NoResourceFoundException e) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(error("NOT_FOUND", "资源不存在"));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> handleOther(Exception e) {
    log.error("未处理异常", e);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(error("INTERNAL_ERROR", "服务器内部错误"));
  }

  private Map<String, Object> error(String code, String message) {
    Map<String, Object> err = new LinkedHashMap<>();
    err.put("code", code);
    err.put("message", message);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("error", err);
    return body;
  }
}
