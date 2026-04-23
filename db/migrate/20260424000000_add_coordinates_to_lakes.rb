# frozen_string_literal: true

class AddCoordinatesToLakes < ActiveRecord::Migration[8.1]
  def change
    add_column :lakes, :latitude, :decimal, precision: 10, scale: 7
    add_column :lakes, :longitude, :decimal, precision: 10, scale: 7
  end
end
