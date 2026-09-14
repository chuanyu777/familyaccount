package com.familyledger;

import com.familyledger.db.Migrator;
import com.familyledger.db.Seeder;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class FamilyLedgerApplication {

  public static void main(String[] args) {
    SpringApplication.run(FamilyLedgerApplication.class, args);
  }

  /** 启动即执行数据库版本迁移，然后初始化种子数据（两者都幂等）。 */
  @Bean
  CommandLineRunner startup(Migrator migrator, Seeder seeder) {
    return args -> {
      migrator.migrate();
      seeder.ensureSeeded();
    };
  }
}
