package com.familyledger;

import com.familyledger.db.Migrator;
import com.familyledger.db.Seeder;
import com.familyledger.service.CategoryService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class FamilyLedgerApplication {

  public static void main(String[] args) {
    SpringApplication.run(FamilyLedgerApplication.class, args);
  }

  /**
   * 启动即执行：1) 数据库版本迁移；2) 种子数据初始化；3) 分类图标回填。
   * 顺序不可调换：迁移要先，Seeder 要在迁移后，回填要在所有分类就位后。
   */
  @Bean
  CommandLineRunner startup(Migrator migrator, Seeder seeder, CategoryService categoryService) {
    return args -> {
      migrator.migrate();
      seeder.ensureSeeded();
      int updated = categoryService.backfillIconsByName();
      if (updated > 0) System.out.printf("[backfill] 已为 %d 个历史分类补齐 icon_key%n", updated);
    };
  }
}
